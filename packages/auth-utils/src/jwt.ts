import fs from 'fs';
import { SignJWT, jwtVerify, JWTPayload, importPKCS8, importSPKI } from 'jose';
import crypto from 'crypto';

// Keys are read lazily on first use — NOT at module load time.
// This allows services that import auth-utils but never call JWT functions
// (rbac, market-data, notification) to boot without JWT env vars.
let privateKeyPem: string | null = null;
let publicKeyPem: string | null = null;
let privateKeyObj: any;
let publicKeyObj: any;

function loadPrivateKeyPem(): string {
  if (!privateKeyPem) {
    const path = process.env.JWT_PRIVATE_KEY_PATH;
    if (!path) throw new Error('JWT_PRIVATE_KEY_PATH env var is not set');
    privateKeyPem = fs.readFileSync(path, 'utf8');
  }
  return privateKeyPem;
}

function loadPublicKeyPem(): string {
  if (!publicKeyPem) {
    const path = process.env.JWT_PUBLIC_KEY_PATH;
    if (!path) throw new Error('JWT_PUBLIC_KEY_PATH env var is not set');
    publicKeyPem = fs.readFileSync(path, 'utf8');
  }
  return publicKeyPem;
}

async function getPrivateKey() {
  if (!privateKeyObj) privateKeyObj = await importPKCS8(loadPrivateKeyPem(), 'RS256');
  return privateKeyObj;
}

async function getPublicKey() {
  if (!publicKeyObj) publicKeyObj = await importSPKI(loadPublicKeyPem(), 'RS256');
  return publicKeyObj;
}

// ─── TOKEN TYPE LITERAL ───────────────────────────────────────────────────────
// B-9 FIX: Every token now carries a `typ` claim that is asserted by every
// verifier. This prevents access tokens being accepted as registration tokens
// (and vice-versa), which was possible because both were signed by the same key
// and only required a `jti` field to pass verification.
export type TokenType = 'access' | 'refresh' | 'registration';

export interface TokenPayload extends JWTPayload {
  user_id: string;
  user_type: string;
  state: string;
  device_id: string;
  roles: string[];
  name?: string;
  /** B-9: token type discriminator — must be "access" for API access tokens */
  typ: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  user_id: string;
  device_id: string;
  token_family: string;
  /** B-9: token type discriminator — must be "refresh" */
  typ: 'refresh';
}

export async function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp' | 'jti' | 'typ'>): Promise<string> {
  const key = await getPrivateKey();
  const expSeconds = parseInt(process.env.JWT_ACCESS_EXPIRY || '3600', 10);
  const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
  const audience = process.env.JWT_AUDIENCE || 'stoxify-api';

  return new SignJWT({ ...payload, typ: 'access' } as any)
    .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID || 'v1.0' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(`${expSeconds}s`)
    .sign(key);
}

export async function signRefreshToken(userId: string, deviceId: string, tokenFamily: string): Promise<string> {
  const key = await getPrivateKey();
  const expSeconds = parseInt(process.env.JWT_REFRESH_EXPIRY || '2592000', 10);
  const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
  const audience = process.env.JWT_AUDIENCE || 'stoxify-api';

  return new SignJWT({ user_id: userId, device_id: deviceId, token_family: tokenFamily, typ: 'refresh' })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID || 'v1.0' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(`${expSeconds}s`)
    .sign(key);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    const key = await getPublicKey();
    const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
    const audience = process.env.JWT_AUDIENCE || 'stoxify-api';
    const { payload } = await jwtVerify(token, key, { issuer, audience });

    // B-9 FIX: Reject any token whose typ is not "access".
    // This prevents a registration token (same key, same jti) from being used
    // as a session access token downstream.
    if ((payload as any).typ !== 'access') {
      throw new Error('Wrong token type');
    }

    return payload as TokenPayload;
  } catch {
    throw new Error('Invalid token');
  }
}

// B-9 FIX: Dedicated verifier for refresh tokens. Must be used on the /auth/refresh
// endpoint instead of verifyToken(), which only accepts typ === "access".
// Without this, an attacker could submit an access token to the refresh endpoint
// (same key, same jti structure) and the verification would pass.
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const key = await getPublicKey();
    const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
    const audience = process.env.JWT_AUDIENCE || 'stoxify-api';
    const { payload } = await jwtVerify(token, key, { issuer, audience });

    if ((payload as any).typ !== 'refresh') {
      throw new Error('Wrong token type');
    }

    return payload as RefreshTokenPayload;
  } catch {
    throw new Error('Invalid refresh token');
  }
}

// ─── REGISTRATION TOKEN ──────────────────────────────────────────────────────
// Short-lived bridge token issued after phone-OTP verification when the
// authenticated phone does not yet belong to a user. Carries proof that the
// caller controls the identifier so a downstream registration endpoint can
// create the account without re-verifying. Paired with a Redis sentinel
// keyed by `jti` for single-use enforcement.
export interface RegistrationTokenPayload extends JWTPayload {
  identifier: string;
  intent: string;
  jti: string;
  /** B-9: token type discriminator — must be "registration" */
  typ: 'registration';
}

export async function signRegistrationToken(
  payload: { identifier: string; intent: string },
  ttlSec = 900
): Promise<{ token: string; jti: string; expSec: number }> {
  const key = await getPrivateKey();
  const jti = crypto.randomUUID();
  const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
  const audience = process.env.JWT_AUDIENCE || 'stoxify-api';

  const token = await new SignJWT({
    identifier: payload.identifier,
    intent: payload.intent,
    typ: 'registration',
  })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.JWT_KEY_ID || 'v1.0' })
    .setJti(jti)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(`${ttlSec}s`)
    .sign(key);

  return { token, jti, expSec: ttlSec };
}

export async function verifyRegistrationToken(token: string): Promise<RegistrationTokenPayload> {
  try {
    const key = await getPublicKey();
    const issuer = process.env.JWT_ISSUER || 'stoxify-auth';
    const audience = process.env.JWT_AUDIENCE || 'stoxify-api';
    const { payload } = await jwtVerify(token, key, { issuer, audience });

    if (!payload.jti || typeof payload.jti !== 'string') {
      throw new Error('Missing jti');
    }

    // B-9 FIX: Reject any token whose typ is not "registration".
    // Without this, a regular user access token (same key, carries a jti)
    // satisfies this check and can be used to create an analyst account.
    if ((payload as any).typ !== 'registration') {
      throw new Error('Wrong token type');
    }

    return payload as RegistrationTokenPayload;
  } catch {
    throw new Error('Invalid registration token');
  }
}
