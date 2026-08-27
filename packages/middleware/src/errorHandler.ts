import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@stoxify/logger';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error.statusCode) {
    // Custom error thrown with status code
    logger.error({ err: error, url: request.url }, `Error ${error.statusCode}: ${error.message}`);
    return reply.status(error.statusCode).send({
      error: error.message || 'Error',
      code: error.code || error.message || 'ERROR',
      details: (error as any).details || {}
    });
  }

  logger.error({ err: error, url: request.url }, 'Internal Server Error');
  
  return reply.status(500).send({
    error: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    details: {}
  });
}
