import { FastifyRequest } from 'fastify';
import { getRedisClient, RedisKeys } from '@stoxifyorg/redis';
import { logger } from '@stoxifyorg/logger';
import { SecurityLog, User } from '@stoxifyorg/database';
import { randomUUID } from 'crypto';

const STRIKE_TTL_SECONDS = 86400; // 24 hours

/**
 * Called on every 429 for an authenticated user.
 * - Increments a Redis strike counter (24h TTL, resets each 24h window).
 * - >= 3 strikes -> marks user SUSPICIOUS + invalidates RBAC user-state cache + SecurityLog HIGH.
 * - >= 6 strikes -> SecurityLog HIGH (admin must review; no automated suspension per policy).
 *
 * This function is fail-open: any Redis or DB error is swallowed and logged
 * so that rate-limiter failures never cause a service outage.
 *
 * Returns the current strike count, or 0 on error.
 */
export async function recordRateLimitStrike(
  request: FastifyRequest,
  userId: string
): Promise<number> {
  const redis = getRedisClient();
  const ip = request.ip;
  const method = request.method;
  const url = request.url;
  const serviceName = process.env.SERVICE_NAME ?? 'unknown-service';

  try {
    const strikeKey = RedisKeys.rateLimitStrike(userId);
    const strikes = await redis.incr(strikeKey);

    // Set TTL on first strike so the window resets after 24h of no activity
    if (strikes === 1) {
      await redis.expire(strikeKey, STRIKE_TTL_SECONDS);
    }

    if (strikes >= 3) {
      // Mark the user as SUSPICIOUS in the DB (idempotent - only transitions if not already there)
      const user = await User.findOne({ user_id: userId }).lean() as any;
      if (user && !['SUSPICIOUS', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED'].includes(user.state)) {
        await User.findOneAndUpdate(
          { user_id: userId },
          {
            $set: { state: 'SUSPICIOUS' },
            $push: {
              state_history: {
                from_state: user.state,
                to_state: 'SUSPICIOUS',
                timestamp: new Date(),
                reason: `Rate limit strikes threshold reached (${strikes} strikes)`,
                changed_by: 'SYSTEM',
              },
            },
          }
        );

        // Invalidate RBAC user-state cache so next request picks up the new state
        await redis.del(RedisKeys.userState(userId));

        logger.warn(
          { user_id: userId, strikes, ip },
          'User flagged SUSPICIOUS due to repeated rate limit violations'
        );
      }

      // Log a HIGH severity security incident (for both >= 3 and >= 6 strikes)
      const description =
        strikes >= 6
          ? `User ${userId} has reached ${strikes} rate-limit strikes - admin review required (quarter-limits active)`
          : `User ${userId} flagged SUSPICIOUS after ${strikes} rate-limit strikes`;

      try {
        await SecurityLog.create({
          log_id: 'SEC_LOG_' + randomUUID().replace(/-/g, '').slice(0, 10),
          incident_type: 'RATE_LIMIT_ESCALATION',
          severity: 'HIGH',
          ip_address: ip,
          request_method: method,
          request_url: url,
          description,
          action_taken: strikes >= 6 ? 'LIMITS_QUARTERED_ADMIN_REVIEW_REQUIRED' : 'USER_FLAGGED_SUSPICIOUS',
          user_id: userId,
          timestamp: new Date(),
          service_name: serviceName,
        });
      } catch (logErr) {
        logger.error({ logErr }, 'Failed to write rate limit escalation security log');
      }
    }

    return strikes;
  } catch (err) {
    // Fail-open: escalation must never crash the rate limiter
    logger.error({ err, user_id: userId }, 'Rate limit escalation error - continuing without escalation');
    return 0;
  }
}

/**
 * Returns the effective multiplier for a user tier limit based on their
 * current strike count.
 *   - < 3 strikes  -> 1.0 (full limit)
 *   - 3-5 strikes  -> 0.5 (halved; SUSPICIOUS)
 *   - >= 6 strikes -> 0.25 (quarter; admin review required)
 */
export async function getEscalationMultiplier(userId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(RedisKeys.rateLimitStrike(userId));
    const strikes = raw ? parseInt(raw, 10) : 0;
    if (strikes >= 6) return 0.25;
    if (strikes >= 3) return 0.5;
    return 1.0;
  } catch {
    return 1.0; // Fail-open
  }
}
