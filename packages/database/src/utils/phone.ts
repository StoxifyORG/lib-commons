/**
 * Canonical phone handling.
 *
 * Every phone number we persist on a User row — and every Redis key derived
 * from one (OTP codes, OTP rate limits) — must be in exactly one shape, or the
 * same human ends up with two accounts, two OTP buckets and two rate-limit
 * counters. Before this existed the trader login path matched `phone` verbatim
 * while the analyst path `$or`-ed over three spellings, so `9876543210` and
 * `+919876543210` behaved as different people.
 *
 * Canonical form is E.164 for India: `+91` followed by the 10-digit national
 * number.
 */

/** Digits-only national part, or null when the input isn't a shape we know. */
function nationalPart(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);

  return null;
}

/**
 * Returns the E.164 form of an Indian mobile number.
 *
 * Unrecognised shapes are returned trimmed but otherwise untouched: callers
 * validate the format with zod before we ever reach here, and silently
 * rewriting an unexpected value would be worse than storing it verbatim.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const national = nationalPart(trimmed);
  return national ? `+91${national}` : trimmed;
}

/**
 * Every spelling a number may already be stored as.
 *
 * Rows written before the normalization migration can hold the bare 10-digit
 * form, so reads stay tolerant of all of them. Writes always use
 * normalizePhone(). Once the migration has run everywhere this still works —
 * it just matches on the canonical entry.
 */
export function phoneVariants(input: string): string[] {
  const trimmed = input.trim();
  const national = nationalPart(trimmed);
  if (!national) return [trimmed];

  return Array.from(
    new Set([trimmed, `+91${national}`, national, `91${national}`, `0${national}`])
  );
}

/** Mongo filter matching a phone in any stored spelling. */
export function phoneQuery(input: string): { phone: { $in: string[] } } {
  return { phone: { $in: phoneVariants(input) } };
}
