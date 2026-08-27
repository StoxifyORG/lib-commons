import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_V2 = 'v2';
const KEY_HEX_LENGTH = 64; // 32 bytes
const KEY_ID_LENGTH = 8;

/**
 * AES-256-GCM at-rest encryption, keyed by a *ring* rather than a single key.
 *
 * WHY A RING
 * ──────────
 * The original helper stored ciphertext as `iv:tag:ct`, which records nothing
 * about the key that produced it. That makes a key change unrecoverable by
 * construction: every row written under the old key fails its GCM auth check
 * with no way to tell "wrong key" apart from "corrupt data". It also means an
 * environment that quietly runs a different key silently poisons rows in a
 * shared database, and nobody finds out until a human needs the plaintext.
 *
 * So ciphertext now names its key:
 *
 *   v2:<kid>:<iv>:<tag>:<ct>      kid = first 8 hex of sha256(key bytes)
 *
 * Decryption looks the kid up in the ring. Rotation stops being destructive —
 * a retired key stays in the ring and its rows stay readable — and a genuine
 * mismatch reports *which* key is missing instead of guessing.
 *
 * Legacy `iv:tag:ct` rows (written before the kid existed) are still read: with
 * nothing recording their key, every key in the ring is tried in turn.
 */

export type DecryptionFailureReason =
  | 'NO_KEYS_CONFIGURED'
  | 'MALFORMED_CIPHERTEXT'
  | 'UNKNOWN_KEY'
  | 'AUTH_FAILED';

/**
 * Thrown when ciphertext cannot be turned back into plaintext.
 *
 * Carries the key id the ciphertext was written under, so callers can say
 * "this service does not hold key a3f91c2b" rather than "check ENCRYPTION_KEY"
 * and leave an operator to go and diff environments by hand.
 */
export class DecryptionError extends Error {
  readonly reason: DecryptionFailureReason;
  readonly keyId: string | null;
  readonly availableKeyIds: string[];

  constructor(
    reason: DecryptionFailureReason,
    message: string,
    keyId: string | null,
    availableKeyIds: string[]
  ) {
    super(message);
    this.name = 'DecryptionError';
    this.reason = reason;
    this.keyId = keyId;
    this.availableKeyIds = availableKeyIds;
  }
}

interface RingKey {
  id: string;
  key: Buffer;
}

/**
 * A key's public short name. Derived from the key rather than configured, so
 * the same key always gets the same id in every environment with no extra
 * bookkeeping. sha256 means the id leaks nothing usable about the key itself,
 * which matters because ids end up in logs and error responses.
 */
const keyIdFor = (key: Buffer): string =>
  crypto.createHash('sha256').update(key).digest('hex').slice(0, KEY_ID_LENGTH);

let cachedSource: string | undefined;
let cachedRing: RingKey[] = [];

const RETIRED_KEY_PATTERN = /^ENCRYPTION_KEY_RETIRED_(\d+)$/;

/**
 * Collect every configured key source, active key first.
 *
 * The ring is the UNION of three sources rather than a single variable:
 *
 *   1. ENCRYPTION_KEYS      — comma-separated list, first entry is ACTIVE
 *   2. ENCRYPTION_KEY       — the original single-key form; active if (1) is unset
 *   3. ENCRYPTION_KEY_RETIRED_<n> — one retired key per variable, ascending
 *
 * Why the union and not just the comma list: on Azure Container Apps each
 * variable maps to its own secret, and a comma-joined list forces you to know
 * EVERY key in order to change ANY key. That is not a hypothetical — recovering
 * a row written under a stale key meant appending to a secret whose current
 * value could not be read back, so the list form made the recovery impossible
 * without first exporting a live production secret. Per-key variables let a
 * retired key be added and removed on its own.
 *
 * Retired keys never become active, so adding one can never change what new
 * data is encrypted with.
 */
function loadKeyRing(): RingKey[] {
  const retiredNames = Object.keys(process.env)
    .filter((n) => RETIRED_KEY_PATTERN.test(n))
    .sort((a, b) => Number(a.match(RETIRED_KEY_PATTERN)![1]) - Number(b.match(RETIRED_KEY_PATTERN)![1]));

  const entries: Array<[string, string]> = [
    ['ENCRYPTION_KEYS', process.env.ENCRYPTION_KEYS ?? ''],
    ['ENCRYPTION_KEY', process.env.ENCRYPTION_KEY ?? ''],
    ...retiredNames.map((n): [string, string] => [n, process.env[n] ?? '']),
  ];

  // Cache on the exact inputs, so a changed variable is picked up but a hot
  // path does not re-parse the ring on every call.
  const source = entries.map(([n, v]) => `${n}=${v}`).join(' ');
  if (source === cachedSource) return cachedRing;

  const ring: RingKey[] = [];
  const seen = new Set<string>();

  for (const [name, value] of entries) {
    for (const raw of value.split(',')) {
      const hex = raw.trim().toLowerCase();
      if (!hex) continue;
      if (hex.length !== KEY_HEX_LENGTH || !/^[0-9a-f]+$/.test(hex)) {
        throw new Error(
          `${name} contains an invalid entry: every key must be exactly ` +
            `${KEY_HEX_LENGTH} hex characters (32 bytes).`
        );
      }
      const key = Buffer.from(hex, 'hex');
      const id = keyIdFor(key);
      if (seen.has(id)) continue; // the same key from two sources is harmless
      seen.add(id);
      ring.push({ id, key });
    }
  }

  cachedSource = source;
  cachedRing = ring;
  return ring;
}

/** Key ids this process can decrypt with, active first. Safe to log. */
export const encryptionKeyIds = (): string[] => loadKeyRing().map((k) => k.id);

/** Key id new ciphertext is written under, or null when nothing is configured. */
export const activeEncryptionKeyId = (): string | null => loadKeyRing()[0]?.id ?? null;

/**
 * Fail fast at boot if the key ring is unusable.
 *
 * Worth its own call because the failure this guards against is otherwise
 * invisible: a service deployed with a missing or malformed key starts up
 * green, passes every health check, and only breaks when someone reaches for
 * the plaintext — which for payouts means mid-transfer.
 */
export function assertEncryptionKeys(): void {
  const ring = loadKeyRing(); // throws on malformed entries
  if (ring.length === 0) {
    throw new Error(
      'ENCRYPTION_KEYS (or ENCRYPTION_KEY) must be set — at least one 64-character hex key is required.'
    );
  }
}

export const encryptAES = (text: string): string => {
  const active = loadKeyRing()[0];
  if (!active) {
    throw new Error(
      'ENCRYPTION_KEYS (or ENCRYPTION_KEY) must be set — at least one 64-character hex key is required.'
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, active.key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${FORMAT_V2}:${active.id}:${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypt, and report WHICH key succeeded.
 *
 * The key id lets a caller notice it read a row under a retired key and migrate
 * that row onto the active one — the only way a rotation ever finishes, since
 * re-encrypting requires the active key and therefore has to happen inside a
 * process that holds it.
 */
export const decryptAESWithKeyId = (encryptedData: string): { plaintext: string; keyId: string } => {
  const ring = loadKeyRing();
  const available = ring.map((k) => k.id);

  if (ring.length === 0) {
    throw new DecryptionError(
      'NO_KEYS_CONFIGURED',
      'No encryption keys are configured (ENCRYPTION_KEYS / ENCRYPTION_KEY)',
      null,
      available
    );
  }

  const parts = String(encryptedData).split(':');

  let keyId: string | null = null;
  let ivHex: string;
  let tagHex: string;
  let ctHex: string;
  let candidates: RingKey[];

  if (parts.length === 5 && parts[0] === FORMAT_V2) {
    keyId = parts[1];
    ivHex = parts[2];
    tagHex = parts[3];
    ctHex = parts[4];
    candidates = ring.filter((k) => k.id === keyId);
    if (candidates.length === 0) {
      throw new DecryptionError(
        'UNKNOWN_KEY',
        `Ciphertext was encrypted with key ${keyId}, which this service does not hold ` +
          `(available: ${available.join(', ') || 'none'})`,
        keyId,
        available
      );
    }
  } else if (parts.length === 3) {
    // Written before ciphertext recorded its key. Nothing identifies the key,
    // so every key in the ring gets a turn.
    ivHex = parts[0];
    tagHex = parts[1];
    ctHex = parts[2];
    candidates = ring;
  } else {
    throw new DecryptionError('MALFORMED_CIPHERTEXT', 'Invalid encrypted format', null, available);
  }

  for (const candidate of candidates) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, candidate.key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      let decrypted = decipher.update(ctHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return { plaintext: decrypted, keyId: candidate.id };
    } catch {
      // A GCM auth failure here only means "not this key" — keep trying. The
      // loop falling through is the real failure, reported below.
    }
  }

  throw new DecryptionError(
    'AUTH_FAILED',
    keyId
      ? `Ciphertext claims key ${keyId} but failed authentication — the row may be corrupt`
      : `Legacy ciphertext could not be decrypted by any held key ` +
        `(tried: ${available.join(', ') || 'none'}) — it was written under a key this service does not have`,
    keyId,
    available
  );
};

export const decryptAES = (encryptedData: string): string =>
  decryptAESWithKeyId(encryptedData).plaintext;

/**
 * Whether a value can be read with the keys this process holds, without
 * exposing the plaintext.
 *
 * Lets the review UI and the rekey script count unreadable rows so a key
 * problem is found on a listing screen rather than by an operator halfway
 * through a bank transfer.
 */
export const canDecryptAES = (encryptedData: string): boolean => {
  try {
    decryptAES(encryptedData);
    return true;
  } catch {
    return false;
  }
};
