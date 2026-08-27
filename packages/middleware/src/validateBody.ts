import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '@stoxify/logger';

export function validateBody(schema: ZodSchema<any>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.body = await schema.parseAsync(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error({ issues: error.issues, url: request.url }, 'Zod Validation Error');
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          code: 'VALIDATION_ERROR',
          details: error.issues
        });
      }
      throw error;
    }
  };
}
