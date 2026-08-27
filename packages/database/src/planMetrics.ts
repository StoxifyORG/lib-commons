// ─── PLAN (BATCH) PERFORMANCE METRICS ────────────────────────────────────────
// The "Past Performance" block on a batch card / batch detail screen: how the
// trades published to ONE batch actually settled, over the four windows the UI
// offers (30 / 60 / 90 days and all-time).
//
// Lives here rather than in plan-service so the definitions sit next to
// winRate.ts — the trade-side numbers (analyst headline win rate, track-record
// batch split) and the plan-side numbers are read off the same collection and
// must agree. Metrics are never stored on the Plan document: they are derived
// per read, so closing a trade updates them with no write-time fan-out.

import { Trade } from './models/Trade.model';

// Every status that counts as a closed trade, including legacy values still
// present on older documents. trade-service keeps identical local copies in
// trade.service.ts and report.service.ts — any change here must be mirrored
// there, or the same batch will report two different trade counts.
export const CLOSED_TRADE_STATUSES = [
  'CLOSED',
  'MANUALLY_CLOSED',
  'CLOSED_BY_SL',
  'CLOSED_BY_TARGET',
  'TARGET_HIT',
  'SL_HIT',
];

export const MS_PER_DAY = 86_400_000;

// Window keys are what the client's period tabs are keyed on, so they are part
// of the API contract — don't rename without the app.
export const PLAN_METRIC_PERIODS = ['30d', '60d', '90d', 'all'] as const;
export type PlanMetricPeriod = (typeof PLAN_METRIC_PERIODS)[number];

export const PERIOD_DAYS: Record<PlanMetricPeriod, number | null> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  all: null,
};

export interface PlanPeriodMetrics {
  // Closed trades attributed to this batch that settled inside the window.
  total_trades: number;
  // pnl_percent > 0 — the same win definition as refreshAnalystPerformance.
  winning_trades: number;
  // Percentage 0–100, one decimal, half-up. Same unit and rounding as
  // winRatePercent (see winRate.ts) so a batch's accuracy can be compared with
  // the analyst's headline figure without unit drift.
  win_rate: number;
  // Mean pnl_percent across the window's settled trades, two decimals.
  avg_return_percent: number;
  // Mean holding period (exit − entry) in days, two decimals.
  avg_duration_days: number;
  // Newest exit in the window — lets the client say "as of <date>" and tell a
  // dormant batch apart from a busy one with the same counts.
  last_closed_at: Date | null;
}

export type PlanMetrics = Record<PlanMetricPeriod, PlanPeriodMetrics>;

function emptyPeriodMetrics(): PlanPeriodMetrics {
  return {
    total_trades: 0,
    winning_trades: 0,
    win_rate: 0,
    avg_return_percent: 0,
    avg_duration_days: 0,
    last_closed_at: null,
  };
}

export function emptyPlanMetrics(): PlanMetrics {
  return {
    '30d': emptyPeriodMetrics(),
    '60d': emptyPeriodMetrics(),
    '90d': emptyPeriodMetrics(),
    all: emptyPeriodMetrics(),
  };
}

// Half-up to one decimal, matching winRatePercent exactly.
export function winRateOf(total: number, winning: number): number {
  if (total <= 0) return 0;
  return Math.round((winning / total) * 1000) / 10;
}

export function round2(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

// Holding period of a closed trade in days, as a pipeline expression. Shared
// with analystMetrics.ts so "average holding period" means the same thing on a
// batch card and on an analyst card.
//
// Guards against exit < entry on repaired documents: a negative holding period
// would pull the average below zero. Trades with no entry_timestamp yield null,
// which $avg skips.
export const DURATION_DAYS_EXPR = {
  $cond: [
    { $ifNull: ['$entry_timestamp', false] },
    {
      $max: [
        0,
        {
          $divide: [{ $subtract: ['$exit_timestamp', '$entry_timestamp'] }, MS_PER_DAY],
        },
      ],
    },
    null,
  ],
};

// One $group, reused for every window so the four tabs can never be computed
// from different definitions.
const GROUP_STAGE = {
  $group: {
    _id: '$_plans',
    total_trades: { $sum: 1 },
    winning_trades: { $sum: { $cond: [{ $gt: ['$pnl_percent', 0] }, 1, 0] } },
    // $avg skips missing/null values, so trades that closed without a recorded
    // pnl or duration are counted in total_trades but don't drag the averages
    // toward zero.
    avg_return_percent: { $avg: '$pnl_percent' },
    avg_duration_days: { $avg: '$_duration_days' },
    last_closed_at: { $max: '$exit_timestamp' },
  },
};

/**
 * Derive the per-window metrics for a set of batches in a single aggregation.
 *
 * A trade published to N batches is ONE document listing all of them in
 * `plan_ids`, so it is unwound and counted once per batch — a shared trade is
 * genuinely a result for every batch it went to. The per-batch totals therefore
 * sum to more than the analyst's trade count; never add them up.
 *
 * Returns a map keyed by plan_id. Batches with no settled history are absent
 * from the map — callers should fall back to emptyPlanMetrics().
 */
export async function getPlanMetrics(
  planIds: string[],
  now: Date = new Date()
): Promise<Map<string, PlanMetrics>> {
  const result = new Map<string, PlanMetrics>();
  const ids = [...new Set(planIds.filter(Boolean))];
  if (!ids.length) return result;

  const cutoff = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);

  // The window is defined on exit_timestamp: "last 30 days" means trades that
  // SETTLED in the last 30 days, so a long-running position counts once, on the
  // day it produced its result.
  const facets = Object.fromEntries(
    PLAN_METRIC_PERIODS.map((period) => {
      const days = PERIOD_DAYS[period];
      return [
        period,
        days === null
          ? [GROUP_STAGE]
          : [{ $match: { exit_timestamp: { $gte: cutoff(days) } } }, GROUP_STAGE],
      ];
    })
  );

  const [buckets] = await Trade.aggregate([
    {
      $match: {
        // Legacy singular plan_id is matched too, so trades created before
        // multi-batch publish still count toward their batch.
        $or: [{ plan_ids: { $in: ids } }, { plan_id: { $in: ids } }],
        status: { $in: CLOSED_TRADE_STATUSES },
        exit_timestamp: { $exists: true, $ne: null },
      },
    },
    {
      $addFields: {
        _plans: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ['$plan_ids', []] } }, 0] },
            '$plan_ids',
            { $cond: [{ $ifNull: ['$plan_id', false] }, ['$plan_id'], []] },
          ],
        },
        _duration_days: DURATION_DAYS_EXPR,
      },
    },
    { $unwind: '$_plans' },
    // The $or above pulled in whole documents, which may also be published to
    // batches the caller didn't ask about. Drop those unwound rows.
    { $match: { _plans: { $in: ids } } },
    { $facet: facets },
  ]);

  for (const period of PLAN_METRIC_PERIODS) {
    for (const row of (buckets?.[period] ?? []) as any[]) {
      const metrics = result.get(row._id) ?? emptyPlanMetrics();
      metrics[period] = {
        total_trades: row.total_trades ?? 0,
        winning_trades: row.winning_trades ?? 0,
        win_rate: winRateOf(row.total_trades ?? 0, row.winning_trades ?? 0),
        avg_return_percent: round2(row.avg_return_percent),
        avg_duration_days: round2(row.avg_duration_days),
        last_closed_at: row.last_closed_at ?? null,
      };
      result.set(row._id, metrics);
    }
  }

  return result;
}

/**
 * Attach a `metrics` object to each plan in place. Plans with no settled trades
 * get a zeroed block rather than a missing key, so the client always has
 * something to render ("No closed trades yet" is a total_trades of 0, not an
 * absent field).
 */
export async function attachPlanMetrics(plans: any[]): Promise<void> {
  if (!plans.length) return;
  const byPlan = await getPlanMetrics(plans.map((p) => p.plan_id));
  for (const plan of plans) {
    plan.metrics = byPlan.get(plan.plan_id) ?? emptyPlanMetrics();
  }
}
