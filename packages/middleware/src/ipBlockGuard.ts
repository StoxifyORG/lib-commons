import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient, RedisKeys } from '@stoxifyorg/redis';
import { IpBlock } from '@stoxifyorg/database';
import { logger } from '@stoxifyorg/logger';

const CACHE_TTL_SEC = 60;
const REFRESH_LOCK_KEY = 'ip_blocks:refresh_lock';

/**
 * Re-loads the active IP-block set from Mongo into Redis. Cheap to call —
 * we use a Redis lock so multiple replicas don't all refresh simultaneously.
 */
async function refreshCache(): Promise<Set<string>> {
  const redis = getRedisClient();

  // Only one replica at a time refreshes (10s lock).
  const lock = await redis.set(REFRESH_LOCK_KEY, '1', 'EX', 10, 'NX');

  const blocks = await IpBlock.find(
    { $or: [{ expires_at: { $exists: false } }, { expires_at: { $gt: new Date() } }] },
    { ip_address: 1 }
  ).lean();
  const ips = new Set(blocks.map((b: any) => b.ip_address));

  if (lock === 'OK') {
    const key = RedisKeys.ipBlockSet();
    await redis.del(key);
    if (ips.size > 0) {
      await redis.sadd(key, ...Array.from(ips));
    }
    await redis.expire(key, CACHE_TTL_SEC);
  }

  return ips;
}

/**
 * Fast IP-block check. Reads a Redis set first (60s TTL). On a cache miss,
 * refreshes from Mongo. Designed to fail OPEN — if Redis or Mongo is down,
 * the request is allowed (we'd rather take traffic than block legit users
 * on infra hiccups).
 */
export async function ipBlockGuard(request: FastifyRequest, reply: FastifyReply) {
  // Skip internal service-to-service calls: those don't carry X-Forwarded-For
  // because they come straight off the Docker network.
  if (!request.headers['x-forwarded-for']) return;
  // Skip health probes so a bad IP-block table doesn't kill readiness checks.
  if (request.url === '/health') return;

  const ip = request.ip;
  if (!ip) return;

  try {
    const redis = getRedisClient();
    const key = RedisKeys.ipBlockSet();

    let isBlocked = (await redis.sismember(key, ip)) === 1;

    if (!isBlocked) {
      // Cache miss check: is the set itself populated? Use EXISTS to avoid
      // refreshing on every request when there are simply no blocks.
      const exists = (await redis.exists(key)) === 1;
      if (!exists) {
        const ips = await refreshCache();
        isBlocked = ips.has(ip);
      }
    }

    if (isBlocked) {
      logger.warn({ event: 'IP_BLOCKED', ip }, 'Blocked IP rejected at edge');
      return reply
        .status(403)
        .send({ error: 'IP_BLOCKED', code: 'IP_BLOCKED', details: {} });
    }
  } catch (err) {
    logger.error({ err }, 'ipBlockGuard failed — failing open');
  }
}

/**
 * Manually invalidate the cache (call after admin adds/removes an IP block).
 */
export async function invalidateIpBlockCache(): Promise<void> {
  try {
    await getRedisClient().del(RedisKeys.ipBlockSet());
  } catch (err) {
    logger.error({ err }, 'Failed to invalidate IP block cache');
  }
}
