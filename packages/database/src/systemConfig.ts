import { SystemConfig } from './models/SystemConfig.model';

/// Well-known config keys. Keep the list here so the admin panel, the services
/// reading them, and anyone grepping all land in the same place.
export const SystemConfigKeys = {
  /// true → skip the market-hours check when analysts publish or modify trades.
  /// Exists so we can exercise the trade flow outside 09:15–15:30 IST during
  /// testing by flipping a switch, instead of redeploying with an env change.
  BYPASS_MARKET_HOURS: 'trading.bypass_market_hours',
} as const;

/// Reading a flag on every publish would put a Mongo round-trip in the hot path
/// for a value that changes maybe twice a day, so hold it briefly in-process.
/// The cost is that a toggle takes up to TTL to reach a given service — and each
/// service caches independently, so they can disagree for a few seconds.
const CACHE_TTL_MS = 10_000;

const cache = new Map<string, { value: unknown; expires_at: number }>();

/// Reads a config key, falling back to `fallback` when the key is unset. A Mongo
/// failure also yields the fallback: a config lookup must never be the reason a
/// request fails.
export async function getSystemConfigValue<T>(key: string, fallback: T): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires_at > Date.now()) {
    return cached.value as T;
  }

  let value: T = fallback;
  try {
    const doc = await SystemConfig.findOne({ key }).lean() as { value?: unknown } | null;
    if (doc && doc.value !== undefined && doc.value !== null) {
      value = doc.value as T;
    }
  } catch {
    value = fallback;
  }

  cache.set(key, { value, expires_at: Date.now() + CACHE_TTL_MS });
  return value;
}

/// Drops the memo so the next read hits Mongo. Only useful inside the process
/// that owns the write (user-service) — other services still wait out their TTL.
export function invalidateSystemConfigCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
