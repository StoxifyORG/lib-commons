import { logger } from '@stoxifyorg/logger';

/**
 * Shared CORS policy for every service.
 *
 * Each service used to build this inline as
 *   `origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')`
 * which looks like an allowlist but isn't: CORS_ORIGINS was set to `*` in Azure
 * so Flutter web could talk to the gateway, and @fastify/cors collapses any list
 * containing `*` to a bare wildcard. Production answered every preflight with
 * `Access-Control-Allow-Origin: *` alongside `Allow-Credentials: true`, i.e. any
 * page on the internet could call the API and read the response.
 *
 * The rules here:
 *   - A request with no `Origin` header is allowed. Native mobile, curl and
 *     server-to-server callers don't send one and aren't subject to CORS; the
 *     signature + JWT chain is what authenticates them.
 *   - An `Origin` must match the allowlist exactly, or match a subdomain
 *     wildcard entry (`https://*.vercel.app`).
 *   - A bare `*` is never emitted in production. It is dropped with a loud
 *     error so the failure is visible in logs rather than silently permissive.
 */

/**
 * Origins that are Stoxify's own front ends. These are the fallback when
 * CORS_ORIGINS is unset or unusable — the service should still serve its real
 * clients rather than hard-fail, but it should never serve everyone.
 *
 * Both container-app environments are listed because the staging gateway
 * (thankfulriver) and the prod gateway (whiteglacier) are each called by web
 * apps from their own resource group, and stoxify.in / www.stoxify.in are bound
 * as custom domains on stoxify-web-prod.
 */
const BUILT_IN_ORIGINS = [
  'https://stoxify.in',
  'https://www.stoxify.in',
  // Next.js BFF containers.
  'https://stoxify-web.thankfulriver-811030ea.centralindia.azurecontainerapps.io',
  'https://stoxify-web-prod.thankfulriver-811030ea.centralindia.azurecontainerapps.io',
  'https://stoxify-web-prod.whiteglacier-774152f0.centralindia.azurecontainerapps.io',
  // Flutter trader app compiled to web — this is the client that CORS_ORIGINS
  // was widened to `*` for in the first place.
  'https://stoxify-trader-web.thankfulriver-811030ea.centralindia.azurecontainerapps.io',
  'https://stoxify-trader-web-prod.whiteglacier-774152f0.centralindia.azurecontainerapps.io',
  'http://localhost:61432',
];

/** Loopback origins, allowed only outside production. */
const DEV_ORIGIN_PATTERNS = [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * `https://*.vercel.app` matches `https://foo.vercel.app` but NOT
 * `https://vercel.app` or `https://evil-vercel.app`. Only a leading `*.` is
 * supported — a wildcard anywhere else is too easy to write by accident in a
 * way that matches far more than intended.
 */
function matchesWildcard(pattern: string, origin: string): boolean {
  const marker = '://*.';
  const at = pattern.indexOf(marker);
  if (at === -1) return false;

  const scheme = pattern.slice(0, at + 3);
  const suffix = pattern.slice(at + marker.length - 1); // keeps the leading dot
  if (!origin.startsWith(scheme)) return false;

  const host = origin.slice(scheme.length);
  // A real Origin is scheme + host [+ port] and never carries a path, but a
  // non-browser caller can send anything. Without this, `https://evil.com/x.foo.com`
  // would satisfy endsWith() and match the `https://*.foo.com` entry.
  if (host.includes('/')) return false;
  return host.endsWith(suffix);
}

export interface CorsPolicy {
  /** Exact-match origins. */
  allowed: Set<string>;
  /** `https://*.example.com` style entries. */
  wildcards: string[];
  /** True only outside production, when CORS_ORIGINS explicitly contained `*`. */
  reflectAnyOrigin: boolean;
  /** Loopback origins are accepted outside production only. */
  allowLoopback: boolean;
}

export function resolveCorsPolicy(
  rawEnv: string | undefined = process.env.CORS_ORIGINS,
  nodeEnv: string | undefined = process.env.NODE_ENV
): CorsPolicy {
  const isProduction = nodeEnv === 'production';
  const entries = (rawEnv ?? '')
    .split(',')
    .map(normalize)
    .filter(Boolean);

  const hasBareWildcard = entries.includes('*');
  const explicit = entries.filter((entry) => entry !== '*');

  if (hasBareWildcard && isProduction) {
    logger.error(
      { configured: rawEnv },
      'CORS_ORIGINS contains "*". Refusing to send a wildcard Access-Control-Allow-Origin ' +
        'alongside credentials in production — falling back to the built-in Stoxify origins. ' +
        'Set CORS_ORIGINS to an explicit comma-separated list on this container app.'
    );
  }

  // An operator-supplied list wins outright. The built-ins only fill in when
  // there is nothing usable, so a deliberate narrow list is never widened.
  const base = explicit.length > 0 ? explicit : BUILT_IN_ORIGINS.map(normalize);

  const allowed = new Set<string>();
  const wildcards: string[] = [];
  for (const entry of base) {
    if (entry.includes('://*.')) wildcards.push(entry);
    else allowed.add(entry);
  }

  return {
    allowed,
    wildcards,
    reflectAnyOrigin: hasBareWildcard && !isProduction,
    allowLoopback: !isProduction,
  };
}

export function isOriginAllowed(origin: string, policy: CorsPolicy): boolean {
  if (policy.reflectAnyOrigin) return true;

  const candidate = normalize(origin);
  if (policy.allowed.has(candidate)) return true;
  if (policy.wildcards.some((pattern) => matchesWildcard(pattern, candidate))) return true;
  if (policy.allowLoopback) {
    return DEV_ORIGIN_PATTERNS.some((pattern) => pattern.test(candidate));
  }
  return false;
}

/**
 * Drop-in replacement for the inline options every service passed to
 * `app.register(cors, …)`. Header/method lists are unchanged from what the
 * services already sent; only the origin decision is different.
 */
export function buildCorsOptions() {
  const policy = resolveCorsPolicy();

  logger.info(
    {
      exact: [...policy.allowed],
      wildcards: policy.wildcards,
      reflectAnyOrigin: policy.reflectAnyOrigin,
    },
    'CORS allowlist resolved'
  );

  return {
    origin(origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) {
      // No Origin header: not a browser cross-origin request. Mobile apps,
      // curl and inter-service calls land here and must not be broken.
      if (!origin) return callback(null, true);

      if (isOriginAllowed(origin, policy)) return callback(null, true);

      // Deny by omitting the header rather than throwing — a throw would turn a
      // routine cross-origin probe into a 500 and bury real errors.
      logger.warn({ origin }, 'CORS: rejected disallowed origin');
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Correlation-Id',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Timestamp',
      'X-Nonce',
      'X-Device-ID',
      'X-Signature',
      'X-Key-Version',
      'X-Correlation-Id',
    ],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  };
}
