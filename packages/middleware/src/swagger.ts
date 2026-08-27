import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { z, ZodType } from 'zod';

/**
 * Convert a Zod schema — the SAME const the route already passes to
 * `validateBody` — into an OpenAPI-3 JSON Schema for documentation.
 *
 * WHY this and not fastify-type-provider-zod: the type provider's Zod-4 support
 * requires Fastify 5, and every service here is on Fastify 4. Zod 4 ships a
 * native `z.toJSONSchema`, so we generate docs from the exact validation schema
 * without any extra runtime dependency and without a framework upgrade.
 *
 * IMPORTANT: the returned schema is used ONLY for the OpenAPI document. Runtime
 * request validation still happens in the `validateBody` preHandler, so
 * `.refine()` / `.transform()` rules (which JSON Schema can't express) remain
 * enforced. Because both come from the same const, the docs cannot drift from
 * what the API actually accepts.
 */
export function zodDoc(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as Record<
    string,
    unknown
  >;
}

export interface SwaggerOptions {
  /** Human title, e.g. "Auth Service". */
  title: string;
  /** Semver shown in the UI. Defaults to "1.0.0". */
  version?: string;
  /** One-line description of what the service owns. */
  description?: string;
  /**
   * Servers advertised for "Try it out". Defaults to a relative "/" so the UI
   * targets whatever origin is serving it (through nginx or the service port).
   */
  servers?: { url: string; description?: string }[];
}

/**
 * Registers OpenAPI generation (`/openapi.json`) and Swagger UI (`/docs`) on a
 * service's Fastify instance.
 *
 * Call this in `buildApp()` AFTER helmet/sensible but BEFORE registering routes,
 * so @fastify/swagger's onRoute hook captures every endpoint.
 *
 * Routes document their request body by attaching `zodDoc(schema)` to
 * `schema.body` (plus `tags`, `summary`, and a `security` entry). We install a
 * pass-through validator compiler so Fastify does NOT also validate against
 * these schemas — validation stays entirely in the `validateBody` preHandler,
 * leaving runtime behaviour and error shapes exactly as they were.
 */
export async function registerSwagger(
  app: FastifyInstance,
  opts: SwaggerOptions
): Promise<void> {
  // Schemas on route.schema are documentation-only. Neutralise Fastify's AJV so
  // it neither double-validates nor throws when it meets a schema keyword it
  // doesn't recognise. validateBody remains the single source of validation.
  app.setValidatorCompiler(() => (data: unknown) => ({ value: data }));

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: opts.title,
        version: opts.version ?? '1.0.0',
        description: opts.description,
      },
      servers: opts.servers ?? [{ url: '/', description: 'Current origin' }],
      components: {
        securitySchemes: {
          // JWT issued by auth-service, sent as `Authorization: Bearer <jwt>`.
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          // Service-to-service shared secret for internal-only endpoints.
          InternalSecret: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Internal-Secret',
          },
          // ECDSA request signature required on public/client endpoints. The
          // client also sends X-Timestamp, X-Nonce, X-Device-ID, X-Key-Version.
          Signature: { type: 'apiKey', in: 'header', name: 'X-Signature' },
        },
      },
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
    staticCSP: true,
  });

  // Raw spec endpoint the combined docs page fetches. Hidden from the spec
  // itself so it doesn't document itself.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
}
