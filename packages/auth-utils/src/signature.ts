import crypto from 'crypto';
import fs from 'fs';
import { RedisKeys } from '@stoxifyorg/redis';
import { getRedisClient } from '@stoxifyorg/redis';

let defaultPublicKeyPem: string;
try {
  defaultPublicKeyPem = fs.readFileSync(process.env.ECDSA_PUBLIC_KEY_PATH || './keys/ecdsa_public.pem', 'utf8');
} catch (e) {
  // Graceful fallback for build step if key file not present at build time
  defaultPublicKeyPem = '';
}

export async function getPublicKeyForVersion(keyVersion: string): Promise<string> {
  const redis = getRedisClient();
  const cached = await redis.get(RedisKeys.ecdsaPublicKey(keyVersion));
  if (cached) return cached;

  if (keyVersion === (process.env.JWT_KEY_ID ?? 'v1.0')) return defaultPublicKeyPem;

  throw new Error(`Unknown key version: ${keyVersion}`);
}

/**
 * Verify an ECDSA-SHA256 signature.
 * Clients sign with: createSign('SHA256').update(message).sign(ecPrivKey, 'base64')
 * This verifier uses Node.js crypto (OpenSSL) — compatible with every standard client.
 * The public key must be in SPKI PEM format (BEGIN PUBLIC KEY).
 */
export function verifyECDSASignature(
  message: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const sig = Buffer.from(signatureBase64, 'base64');
    return crypto
      .createVerify('SHA256')
      .update(message)
      .verify({ key: publicKeyPem, dsaEncoding: 'der' }, sig);
  } catch {
    return false;
  }
}

export function reconstructMessage(
  method: string,
  url: string,
  body: string,
  timestamp: string,
  nonce: string,
  deviceId: string
): string {
  return `${method}|${url}|${body}|${timestamp}|${nonce}|${deviceId}`;
}
