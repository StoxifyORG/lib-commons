import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, sha256 } from '@stoxifyorg/auth-utils';
import { getRedisClient, RedisKeys } from '@stoxifyorg/redis';
import { logger } from '@stoxifyorg/logger';

declare module 'fastify' {
  interface FastifyRequest {
    user?: any;
    token?: string;
  }
}

export async function verifyJWT(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED', details: {} });
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);
    
    const tokenHash = sha256(token);
    const redis = getRedisClient();
    const isBlacklisted = await redis.exists(RedisKeys.tokenBlacklist(tokenHash));
    
    if (isBlacklisted) {
      logger.warn({ event: 'TOKEN_REVOKED', user_id: payload.user_id, ip: request.ip });
      return reply.status(401).send({ error: 'TOKEN_REVOKED', code: 'TOKEN_REVOKED', details: {} });
    }

    request.user = payload;
    request.token = token;
  } catch (error: any) {
    if (error.message === 'Invalid token') {
      return reply.status(401).send({ error: 'INVALID_TOKEN', code: 'INVALID_TOKEN', details: {} });
    }
    return reply.status(401).send({ error: 'TOKEN_EXPIRED', code: 'TOKEN_EXPIRED', details: {} });
  }
}
