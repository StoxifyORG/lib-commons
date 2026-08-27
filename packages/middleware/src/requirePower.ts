import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { logger } from '@stoxify/logger';

export interface PowerOptions {
  checkOwnership?: boolean;
}

export function requirePower(power: string, options?: PowerOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED', details: {} });
    }

    try {
      const context: any = {};

      if (options?.checkOwnership) {
        const params: any = request.params;
        context.resource_owner = params.user_id || params.analyst_id || params.id;
      }

      // NOTE: user_state is intentionally NOT passed here. The RBAC service reads
      // it live from the DB so that state changes (verify, suspend, unblock)
      // take effect on the very next request without forcing re-login.

      const response = await axios.post(
        `${process.env.RBAC_SERVICE_URL || 'http://localhost:8004'}/rbac/check-permission`,
        {
          user_id: request.user.user_id,
          power,
          context
        },
        {
          headers: {
            'X-Internal-Secret': process.env.INTERNAL_SECRET
          }
        }
      );

      if (!response.data.authorized) {
        logger.warn({ event: 'UNAUTHORIZED_ACCESS', user_id: request.user.user_id, power, reason: response.data.reason });
        return reply.status(403).send({ error: 'INSUFFICIENT_POWER', code: 'INSUFFICIENT_POWER', details: { reason: response.data.reason } });
      }

      // The access token carries `roles` but not `powers`, so handlers reading
      // `request.user.powers` would otherwise always see an empty list and fall
      // back to owner-only behaviour (admins seeing only their own rows,
      // PWR_*_ALL branches never firing). RBAC resolved the full list to answer
      // this check, so hand it to the handler rather than re-deriving it.
      if (Array.isArray(response.data.powers)) {
        (request.user as any).powers = response.data.powers;
      }

      // Sync the live user state from RBAC onto request.user. The JWT state
      // claim is frozen at login; an admin approving KYC or un-suspending a user
      // would not be visible until the user re-logs in. RBAC already fetched the
      // live state from Redis/DB to enforce the state gate above, so we get this
      // for free — downstream middlewares (requireKycVerifiedForRead, etc.) and
      // service handlers now always see the current state.
      if (response.data.state != null) {
        (request.user as any).state = response.data.state;
      }

    } catch (error: any) {
      logger.error({ err: error }, 'RBAC service call failed');
      return reply.status(500).send({ 
        error: 'INTERNAL_ERROR', 
        code: 'INTERNAL_ERROR', 
        details: { 
          power, 
          user_id: request.user?.user_id, 
          downstream_error: error.message || 'Unknown RBAC failure' 
        } 
      });
    }
  };
}
