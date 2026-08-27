import { FastifyInstance } from 'fastify';

/**
 * Registers a JSON body parser that preserves the exact raw request body string
 * on `request.rawBody`, while still parsing it into `request.body` for handlers.
 *
 * WHY: the ECDSA request-signing scheme signs
 *   `METHOD|PATH|BODY|TIMESTAMP|NONCE|DEVICE_ID`
 * where BODY is the exact bytes the client serialized and sent. Verifying
 * against a re-serialized `JSON.stringify(request.body)` is lossy: a client that
 * sends a Dart double `7499.0` round-trips through JSON.parse → 7499 →
 * JSON.stringify → `"7499"`, so the reconstructed message no longer matches what
 * was signed and every such request fails with INVALID_SIGNATURE. Key ordering
 * and whitespace differences would break it the same way. The verifier must
 * compare against these raw bytes — see `verifySignature`.
 *
 * Must be registered on each service's Fastify instance before routes.
 */
export function registerRawBody(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      (req as unknown as { rawBody?: string }).rawBody = body as string;
      const str = body as string;
      if (str === undefined || str === null || str === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(str));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    }
  );
}
