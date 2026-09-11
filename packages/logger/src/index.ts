import pino, { TransportMultiOptions, TransportSingleOptions, TransportTargetOptions } from 'pino';

function resolveTarget(name: string): string {
  try {
    return require.resolve(name);
  } catch {
    return name;
  }
}

/**
 * Production with no Loki uses pino's default stdout (no worker).
 * The moment a transport exists, pino stops writing stdout itself — so Loki
 * always pairs with `pino/file` destination 1, or Azure Log stream goes dark.
 */
export function buildTransport(): TransportSingleOptions | TransportMultiOptions | undefined {
  const targets: TransportTargetOptions[] = [];
  const lokiUrl = process.env.GRAFANA_LOKI_URL;

  if (process.env.NODE_ENV === 'development') {
    targets.push({
      target: resolveTarget('pino-pretty'),
      options: { colorize: true, translateTime: 'SYS:standard' },
    });
  } else if (lokiUrl) {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
    });
  }

  if (lokiUrl) {
    targets.push({
      target: resolveTarget('pino-loki'),
      options: {
        batching: true,
        interval: 5,
        timeout: 5000,
        silenceErrors: true,
        host: lokiUrl,
        basicAuth:
          process.env.GRAFANA_LOKI_USER && process.env.GRAFANA_LOKI_TOKEN
            ? {
                username: process.env.GRAFANA_LOKI_USER,
                password: process.env.GRAFANA_LOKI_TOKEN,
              }
            : undefined,
        labels: {
          service: process.env.SERVICE_NAME ?? 'unknown',
          environment:
            process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
          azure_revision: process.env.CONTAINER_APP_REVISION ?? 'local',
        },
      },
    });
  }

  if (targets.length === 0) return undefined;
  if (targets.length === 1) return targets[0];
  return { targets };
}

/** Replacement written in place of any sensitive value. */
export const REDACT_CENSOR = '[REDACTED]';

/**
 * Keys whose values must never be written to stdout.
 *
 * Matching is case-insensitive, so each key is listed once in its canonical
 * form; `Authorization`, `authorization` and `AUTHORIZATION` all match the
 * single `authorization` entry below.
 */
export const SENSITIVE_KEYS = [
  // Credentials
  'password',
  'passwd',
  'newPassword',
  'new_password',
  'oldPassword',
  'old_password',
  'confirmPassword',
  'confirm_password',
  'secret',
  'clientSecret',
  'client_secret',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'internalSecret',
  'internal_secret',

  // Tokens and sessions
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'id_token',
  'jwt',
  'sessionId',
  'session_id',

  // Headers
  'authorization',
  'cookie',
  'set-cookie',
  'x-signature',
  'x-api-key',
  'x-internal-secret',
  'x-auth-token',

  // OTPs and PINs
  'otp',
  'otpCode',
  'otp_code',
  'pin',
  'mpin',

  // KYC and bank identifiers
  'pan',
  'panNumber',
  'pan_number',
  'aadhaar',
  'aadhaarNumber',
  'aadhaar_number',
  'accountNumber',
  'account_number',
  'ifsc',
  'ifscCode',
  'ifsc_code',
  'upiId',
  'upi_id',
  'cardNumber',
  'card_number',
  'cvv',
  // Contact PII. `identifier` is the login field auth-service logs, and it
  // carries either a phone number or an email address.
  'identifier',
  'phone',
  'phoneNumber',
  'phone_number',
  'mobile',
  'mobileNumber',
  'mobile_number',
  'email',
  'emailAddress',
  'email_address',
] as const;

const SENSITIVE_LOOKUP = new Set<string>(SENSITIVE_KEYS.map((key) => key.toLowerCase()));

/** True when `key` names a value that must be censored, at any nesting level. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_LOOKUP.has(key.toLowerCase());
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The top-level paths handed to pino's own `redact`.
 *
 * These duplicate what the walker below already covers. They are kept as a
 * cheap, battle-tested floor: `redact` censors during serialization, so it
 * still applies on any path that bypasses `formatters.log`, and it is what
 * survives if the walker ever bails out. Literal (wildcard-free) paths are
 * effectively free — measured at ~24ns/log against a 522ns baseline — whereas
 * each `*` path costs roughly 500ns, so only literals are listed here.
 */
export const redactPaths: string[] = SENSITIVE_KEYS.map((key) =>
  IDENTIFIER.test(key) ? key : `["${key}"]`,
);

/**
 * Depth ceiling for the walker. The cycle guard already rules out infinite
 * recursion; this bounds pathologically deep payloads and keeps the traversal
 * off the edge of the call stack. Realistic log objects — including a
 * serialized axios error, whose credentials sit at
 * `err.response.config.headers.authorization` (depth 5) — are well inside it.
 */
const MAX_DEPTH = 10;

/** Marks an object that is currently being walked, to detect cycles. */
const IN_PROGRESS = Symbol('in-progress');

/**
 * Values whose own enumerable keys are not their data. Cloning or walking these
 * would either mangle their serialization or waste time enumerating indices, so
 * they are passed through untouched.
 */
function isOpaque(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) // Buffer, TypedArrays, DataView
  );
}

/**
 * Shallow copy that keeps the prototype and property descriptors of the
 * original.
 *
 * A spread would flatten everything onto a plain object, which changes how
 * pino serializes values that rely on their prototype — most importantly the
 * object `pino.stdSerializers.err` produces, which is where credentials from a
 * failed axios call end up.
 */
function cloneShallow<T extends object>(source: T): T {
  return Object.create(
    Object.getPrototypeOf(source) as object | null,
    Object.getOwnPropertyDescriptors(source),
  ) as T;
}

function assign(target: Record<string, unknown>, key: string, value: unknown): void {
  // defineProperty rather than `=`, so a getter-only property cannot throw.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Censors sensitive keys at every depth, in a single pass.
 *
 * pino's `redact` can only match a fixed number of levels (`*.token` matches
 * exactly one level down), and each wildcard path re-enumerates the object, so
 * covering realistic nesting that way costs ~82µs per log call and still misses
 * anything deeper. This walks the object once instead: unlimited depth for
 * ~870ns against a ~520ns un-redacted baseline.
 *
 * Everything not sensitive is preserved exactly. Containers are cloned only
 * when something inside them actually changed (copy-on-write), and the clone
 * keeps the original prototype, so serialization is unaffected.
 */
function censor(value: unknown, depth: number, seen: Map<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return value;

  // Plain objects and arrays are the overwhelmingly common case, and both can
  // be copied cheaply. Anything else needs the instanceof checks, and — if it
  // is still worth walking — the descriptor-preserving clone below.
  const isArray = Array.isArray(value);
  let isPlain = false;
  if (!isArray) {
    const proto = Object.getPrototypeOf(value) as unknown;
    isPlain = proto === Object.prototype || proto === null;
    if (!isPlain && isOpaque(value)) return value;
  }

  const seenAs = seen.get(value);
  // A back-reference into an object we are still inside is a cycle. pino's
  // serializer writes '[Circular]' for these, so matching it keeps output
  // identical to what callers already see.
  if (seenAs === IN_PROGRESS) return '[Circular]';
  // A repeat of an already-finished object reuses its censored form, so shared
  // references cannot smuggle out an uncensored copy.
  if (seenAs !== undefined) return seenAs;

  seen.set(value, IN_PROGRESS);
  try {
    if (isArray) {
      const source = value as unknown[];
      let out = source;
      for (let i = 0; i < source.length; i += 1) {
        const censored = censor(source[i], depth + 1, seen);
        if (censored !== source[i]) {
          if (out === source) out = source.slice();
          out[i] = censored;
        }
      }
      seen.set(value, out);
      return out;
    }

    const source = value as Record<string, unknown>;
    let out = source;
    for (const key of Object.keys(source)) {
      const original = source[key];
      const censored = isSensitiveKey(key)
        ? REDACT_CENSOR
        : censor(original, depth + 1, seen);
      if (censored !== original) {
        if (out === source) out = isPlain ? { ...source } : cloneShallow(source);
        if (isPlain) out[key] = censored;
        else assign(out, key, censored);
      }
    }
    seen.set(value, out);
    return out;
  } catch {
    // Logging must never be the thing that breaks a request. If the walk fails
    // for any reason, fall back to the original object; pino's `redact` above
    // still censors the top-level keys.
    seen.set(value, value);
    return value;
  }
}

function censorRoot(object: Record<string, unknown>): Record<string, unknown> {
  return censor(object, 0, new Map()) as Record<string, unknown>;
}

/**
 * The redaction half of the logger config, exported so tests and services can
 * build a logger that censors exactly the way the shared one does.
 */
export const redactionOptions = {
  redact: { paths: redactPaths, censor: REDACT_CENSOR },
  formatters: {
    // Runs after pino's serializers, so a serialized `err` is covered too.
    log: censorRoot,
    // Child bindings bypass `formatters.log` entirely — `logger.child({ token })`
    // would otherwise print the token on every line the child writes.
    bindings: censorRoot,
  },
} satisfies pino.LoggerOptions;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...redactionOptions,
  transport: buildTransport(),
});

export type Logger = typeof logger;
export default logger;
