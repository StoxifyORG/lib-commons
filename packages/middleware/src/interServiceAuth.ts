import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { logger } from '@stoxify/logger';

export async function interServiceAuth(request: FastifyRequest, reply: FastifyReply) {
  const secretHeader = request.headers['x-internal-secret'] as string;
  const envSecret = process.env.INTERNAL_SECRET;

  if (!secretHeader || !envSecret) {
    logger.warn({ event: 'UNAUTHORIZED_ACCESS', reason: 'Missing internal secret', ip: request.ip });
    return reply.status(401).send({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED', details: {} });
  }

  try {
    const a = Buffer.from(secretHeader);
    const b = Buffer.from(envSecret);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Mismatch');
    }
  } catch {
    logger.warn({ event: 'UNAUTHORIZED_ACCESS', reason: 'Invalid internal secret', ip: request.ip });
    return reply.status(401).send({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED', details: {} });
  }
}
