/**
 * Date primitives for the Toolkit tools.
 *
 * Why this exists: the prior tools used `new Date('2026-01-01')` which is
 * parsed as UTC midnight. In any negative-offset timezone (US) that Date
 * object's local fields are *the day before*. That broke prepaid
 * amortization (12-month invoice computed across 13 months) and the
 * lease schedule's "month end" dates. They also relied on
 * `setMonth(getMonth() + 1)` to step through months, which silently
 * skips February when the cursor lands on Jan 31 (Feb 31 normalizes
 * forward to March 3).
 *
 * These helpers stay on plain `{y, m, d}` structs and never round-trip
 * through Date for arithmetic, so neither bug can come back.
 */

export interface YMD {
  y: number;
  m: number; // 0-indexed (Jan = 0)
  d: number;
}

/** Parse a 'YYYY-MM-DD' string into a YMD struct. Returns null on bad input. */
export const parseYMD = (s: string): YMD | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = +match[1], m = +match[2] - 1, d = +match[3];
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
};

export const formatYMD = (ymd: YMD): string =>
  `${String(ymd.y).padStart(4, '0')}-${String(ymd.m + 1).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`;

/** Last day-of-month (e.g. Feb 2024 → 29, Feb 2023 → 28). */
export const lastDayOfMonth = (year: number, monthIdx: number): number =>
  new Date(year, monthIdx + 1, 0).getDate();

/**
 * Add a (possibly negative) number of months to a YMD. The day is clamped
 * to the last valid day of the target month, so Jan 31 + 1 month → Feb 28
 * (or Feb 29 in a leap year), NOT March 3.
 */
export const addMonths = (ymd: YMD, months: number): YMD => {
  const totalM = ymd.m + months;
  const y = ymd.y + Math.floor(totalM / 12);
  const m = ((totalM % 12) + 12) % 12;
  const d = Math.min(ymd.d, lastDayOfMonth(y, m));
  return { y, m, d };
};

/**
 * Inclusive month count from `start` through `end`. Same (year, month)
 * pair → 1. Jan → Dec same year → 12. Returns 0 when end is before start.
 */
export const monthsInclusive = (start: YMD, end: YMD): number => {
  const n = (end.y - start.y) * 12 + (end.m - start.m) + 1;
  return n > 0 ? n : 0;
};

/** Last-day-of-month for a given (year, monthIdx) returned as a YYYY-MM-DD string. */
export const monthEndStr = (year: number, monthIdx: number): string =>
  formatYMD({ y: year, m: monthIdx, d: lastDayOfMonth(year, monthIdx) });
