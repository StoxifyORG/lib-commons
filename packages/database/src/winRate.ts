// ─── WIN RATE ────────────────────────────────────────────────────────────────
// Win rate is never stored — every read path derives it from the same two
// counters on Analyst.performance (kept current by trade-service's
// refreshAnalystPerformance and the nightly performanceCalc job). It used to be
// computed inline at each call site, which is how analyst discovery ended up
// returning a 0–1 fraction (0.3968…) while the trade cards returned a 0–100
// percentage (39.7) for the very same analyst. Every caller now goes through
// here, and the agreed unit is a PERCENTAGE (0–100) rounded to one decimal.

export type AnalystPerformanceCounters = {
  total_trades?: number | null;
  winning_trades?: number | null;
};

export function winRatePercent(performance?: AnalystPerformanceCounters | null): number {
  const total = performance?.total_trades ?? 0;
  const wins = performance?.winning_trades ?? 0;
  if (total <= 0) return 0;
  return Math.round((wins / total) * 1000) / 10;
}

// Aggregation-pipeline twin of winRatePercent, for read paths that derive the
// field inside a $addFields/$project stage rather than in JS. Must stay in step
// with the function above — same unit, same rounding.
//
// The arithmetic mirrors winRatePercent operation for operation, including the
// half-up rounding: $round is deliberately NOT used because it rounds half to
// even, so an exact tie like 39/48 = 81.25% would come back as 81.2 here and
// 81.3 from the function above — the very drift this module exists to prevent.
export const WIN_RATE_PERCENT_EXPR = {
  $cond: [
    { $gt: ['$performance.total_trades', 0] },
    {
      $divide: [
        {
          $floor: {
            $add: [
              {
                $multiply: [
                  {
                    $divide: [
                      { $ifNull: ['$performance.winning_trades', 0] },
                      '$performance.total_trades',
                    ],
                  },
                  1000,
                ],
              },
              0.5,
            ],
          },
        },
        10,
      ],
    },
    0,
  ],
};
