import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { getRedisClient, RedisKeys } from '@stoxify/redis';
import { logger } from '@stoxify/logger';
import { SecurityLog } from '@stoxify/database';
import { ipBlockGuard } from './ipBlockGuard';
import { recordRateLimitStrike, getEscalationMultiplier } from './rateLimitEscalation';

const TIER_LIMITS: Record<string, number> = {
  END_USER: 100,
  ANALYST: 500,
  INTERNAL_TEAM: 1000,
};

// Fixed-window limits - corrected to match spec (section 5.1-5.2)
const IP_LIMIT = parseInt(process.env.RATE_LIMIT_IP ?? '1000', 10);
const DEVICE_LIMIT = parseInt(process.env.RATE_LIMIT_DEVICE ?? '150', 10);

// 2-minute TTL buffer (spec section 5.2) prevents double-counting at minute boundaries
// while keeping the counter O(1) and the Redis key footprint small.
const WINDOW_TTL_MS = 120_000;
const WINDOW_TTL_SEC = WINDOW_TTL_MS / 1000;

async function writeRateLimitLog(params: {
  ip: string;
  request_method: string;
  request_url: string;
  description: string;
  user_id?: string;
  device_id?: string;
  service_name: string;
}) {
  try {
    await SecurityLog.create({
      log_id: 'SEC_LOG_' + randomUUID().replace(/-/g, '').slice(0, 10),
      incident_type: 'RATE_LIMIT_EXCEEDED',
      severity: 'MEDIUM',
      ip_address: params.ip,
      request_method: params.request_method,
      request_url: params.request_url,
      description: params.description,
      action_taken: 'BLOCKED',
      user_id: params.user_id,
      device_id: params.device_id,
      timestamp: new Date(),
      service_name: params.service_name,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write rate limit security log');
  }
}

/**
 * Injects standard rate-limit informational headers on every reply (not just 429s).
 * Spec section 5.3: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.
 */
function setRateLimitHeaders(
  reply: FastifyReply,
  limit: number,
  count: number,
  windowEndMs: number
) {
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, limit - count));
  reply.header('X-RateLimit-Reset', windowEndMs);
}

export async function rateLimiter(request: FastifyRequest, reply: FastifyReply) {
  // IP-level abuse block runs first - cheaper than rate counter math and we
  // want blocked IPs out before they consume Redis budget.
  await ipBlockGuard(request, reply);
  if (reply.sent) return;

  const minute = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
  const windowEndMs = Math.ceil(Date.now() / 60000) * 60000; // end of current minute in epoch ms
  const redis = getRedisClient();

  const ip = request.ip;
  const deviceId = request.headers['x-device-id'] as string;
  const user = (request as any).user;
  const method = request.method;
  const url = request.url;
  const serviceName = process.env.SERVICE_NAME ?? 'unknown-service';

  // IP check
  const ipKey = RedisKeys.rateLimitIp(ip, minute);
  const ipCount = await redis.incr(ipKey);
  if (ipCount === 1) await redis.pexpire(ipKey, WINDOW_TTL_MS);

  setRateLimitHeaders(reply, IP_LIMIT, ipCount, windowEndMs);

  if (ipCount > IP_LIMIT) {
    logger.warn({ event: 'RATE_LIMIT_EXCEEDED', type: 'IP', ip });
    writeRateLimitLog({
      ip,
      request_method: method,
      request_url: url,
      description: `IP rate limit exceeded (${ipCount}/${IP_LIMIT} req/min) from ${ip}`,
      user_id: user?.user_id,
      device_id: deviceId,
      service_name: serviceName,
    });
    reply.header('Retry-After', WINDOW_TTL_SEC);
    return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', code: 'RATE_LIMIT_EXCEEDED', details: { type: 'IP' } });
  }

  // Device check
  if (deviceId) {
    const deviceKey = RedisKeys.rateLimitDevice(deviceId, minute);
    const deviceCount = await redis.incr(deviceKey);
    if (deviceCount === 1) await redis.pexpire(deviceKey, WINDOW_TTL_MS);

    if (deviceCount > DEVICE_LIMIT) {
      logger.warn({ event: 'RATE_LIMIT_EXCEEDED', type: 'DEVICE', deviceId });
      writeRateLimitLog({
        ip,
        request_method: method,
        request_url: url,
        description: `Device rate limit exceeded (${deviceCount}/${DEVICE_LIMIT} req/min) for device ${deviceId}`,
        user_id: user?.user_id,
        device_id: deviceId,
        service_name: serviceName,
      });
      // Trigger escalation for authenticated user on device-level 429
      if (user?.user_id) {
        recordRateLimitStrike(request, user.user_id).catch(() => {});
      }
      reply.header('Retry-After', WINDOW_TTL_SEC);
      return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', code: 'RATE_LIMIT_EXCEEDED', details: { type: 'DEVICE' } });
    }
  }

  // User / tier check
  if (user) {
    const baseTierLimit = TIER_LIMITS[user.user_type] ?? 100;

    // Apply escalation multiplier (halved at SUSPICIOUS / quartered at 6+ strikes)
    // getEscalationMultiplier is fail-open and returns 1.0 on any error.
    const multiplier = await getEscalationMultiplier(user.user_id);
    const effectiveLimit = Math.floor(baseTierLimit * multiplier);

    const userKey = RedisKeys.rateLimitUser(user.user_id, minute);
    const userCount = await redis.incr(userKey);
    if (userCount === 1) await redis.pexpire(userKey, WINDOW_TTL_MS);

    // Override headers with user-tier values (more specific than IP)
    setRateLimitHeaders(reply, effectiveLimit, userCount, windowEndMs);

    if (userCount > effectiveLimit) {
      logger.warn({ event: 'RATE_LIMIT_EXCEEDED', type: 'USER', user_id: user.user_id });
      writeRateLimitLog({
        ip,
        request_method: method,
        request_url: url,
        description: `User rate limit exceeded (${userCount}/${effectiveLimit} req/min) for user ${user.user_id} (${user.user_type}, multiplier=${multiplier})`,
        user_id: user.user_id,
        device_id: deviceId,
        service_name: serviceName,
      });
      // Record strike and potentially escalate to SUSPICIOUS (fail-open)
      recordRateLimitStrike(request, user.user_id).catch(() => {});
      reply.header('Retry-After', WINDOW_TTL_SEC);
      return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', code: 'RATE_LIMIT_EXCEEDED', details: { type: 'USER' } });
    }
  }
}
