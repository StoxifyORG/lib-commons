import { FastifyRequest, FastifyReply } from 'fastify';
import { checkAndMarkNonce, getPublicKeyForVersion, reconstructMessage, verifyECDSASignature } from '@stoxify/auth-utils';
import { logger } from '@stoxify/logger';

export async function verifySignature(request: FastifyRequest, reply: FastifyReply) {
  const timestamp = request.headers['x-timestamp'] as string;
  const deviceId = request.headers['x-device-id'] as string;
  const nonce = request.headers['x-nonce'] as string;
  const signature = request.headers['x-signature'] as string;
  const keyVersion = (request.headers['x-key-version'] as string) ?? process.env.JWT_KEY_ID ?? 'v1.0';

  if (!timestamp || !deviceId || !nonce || !signature) {
    logger.warn({ event: 'INVALID_SIGNATURE', reason: 'Missing headers', ip: request.ip });
    return reply.status(401).send({ error: 'INVALID_SIGNATURE', code: 'MISSING_HEADERS', details: {} });
  }

  const tsMs = parseInt(timestamp, 10);
  if (isNaN(tsMs)) {
    return reply.status(401).send({ error: 'INVALID_SIGNATURE', code: 'MALFORMED_TIMESTAMP', details: {} });
  }

  const diffMs = Math.abs(Date.now() - tsMs);
  if (diffMs > 5 * 60 * 1000) {
    logger.warn({ event: 'INVALID_SIGNATURE', reason: 'Stale request', ip: request.ip });
    return reply.status(401).send({ error: 'INVALID_SIGNATURE', code: 'STALE_TIMESTAMP', details: {} });
  }

  const nonceValid = await checkAndMarkNonce(deviceId, nonce);
  if (!nonceValid) {
    logger.warn({ event: 'REPLAY_ATTACK', ip: request.ip });
    return reply.status(401).send({ error: 'REPLAY_ATTACK', code: 'REPLAY_ATTACK', details: {} });
  }

  let publicKey: string;
  try {
    publicKey = await getPublicKeyForVersion(keyVersion);
  } catch {
    return reply.status(401).send({ error: 'INVALID_SIGNATURE', code: 'UNKNOWN_KEY_VERSION', details: {} });
  }

  // Verify against the EXACT bytes the client signed. The client signs the raw
  // serialized body it puts on the wire; re-serializing `request.body` here is
  // lossy (e.g. a Dart double `7499.0` becomes `7499`, key order/whitespace may
  // differ) and would spuriously fail. `rawBody` is captured by the JSON parser
  // registered via `registerRawBody`. Falls back to a re-serialization only if
  // that parser isn't wired up (e.g. bodyless requests have no rawBody).
  const rawBody = (request as unknown as { rawBody?: string }).rawBody;
  const body = rawBody ?? JSON.stringify(request.body ?? {});
  const message = reconstructMessage(request.method, request.url, body, timestamp, nonce, deviceId);

  const valid = verifyECDSASignature(message, signature, publicKey);
  if (!valid) {
    logger.warn({ event: 'INVALID_SIGNATURE', reason: 'Signature mismatch', ip: request.ip, messageVerified: message, providedSignature: signature });
    return reply.status(401).send({ error: 'INVALID_SIGNATURE', code: 'SIGNATURE_MISMATCH', details: {} });
  }
}
