// ─── ANALYST PERFORMANCE METRICS ─────────────────────────────────────────────
// The analyst-level twin of planMetrics: the same four windows, but over ALL of
// an analyst's closed trades instead of one batch's. Backs the Discover card and
// the public profile, which show accuracy, average return and average holding
// period without the caller knowing anything about batches.
//
// This cannot be assembled client-side from the plan-level block. There a trade
// published to N batches is counted once per batch, so summing an analyst's
// batches double-counts every shared trade — the per-batch totals deliberately
// sum to more than the analyst's trade count. Grouping on analyst_id here counts
// each trade exactly once.
//
// Lives next to planMetrics.ts and reuses its window definitions and rounding so
// the two blocks can never disagree about what "last 30 days" or "a win" means.

import { Trade } from './models/Trade.model';
import {
  CLOSED_TRADE_STATUSES,
  PLAN_METRIC_PERIODS,
  PERIOD_DAYS,
  MS_PER_DAY,
  DURATION_DAYS_EXPR,
  winRateOf,
  round2,
  type PlanMetricPeriod,
} from './planMetrics';

export interface AnalystPeriodMetrics {
  // Closed trades by this analyst that settled inside the window.
  total_trades: number;
  // pnl_percent > 0 — the same win definition as refreshAnalystPerformance.
  winning_trades: number;
  // Accuracy. Percentage 0–100, one decimal, half-up — the backend-wide unit
  // (see winRate.ts), so this is directly comparable with the analyst's stored
  // performance.win_rate and with a batch's metrics.win_rate.
  win_rate: number;
  // Mean pnl_percent across the window's settled trades, two decimals.
  avg_return_percent: number;
  // Mean holding period (exit − entry) in days, two decimals.
  avg_duration_days: number;
  // Newest exit in the window — lets the client say "as of <date>" and tell a
  // dormant analyst apart from an active one with the same counts.
  last_closed_at: Date | null;
}

export type AnalystMetrics = Record<PlanMetricPeriod, AnalystPeriodMetrics>;

function emptyPeriodMetrics(): AnalystPeriodMetrics {
  return {
    total_trades: 0,
    winning_trades: 0,
    win_rate: 0,
    avg_return_percent: 0,
    avg_duration_days: 0,
    last_closed_at: null,
  };
}

export function emptyAnalystMetrics(): AnalystMetrics {
  return {
    '30d': emptyPeriodMetrics(),
    '60d': emptyPeriodMetrics(),
    '90d': emptyPeriodMetrics(),
    all: emptyPeriodMetrics(),
  };
}

// One $group, reused for every window so the four tabs can never be computed
// from different definitions.
const GROUP_STAGE = {
  $group: {
    _id: '$analyst_id',
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
 * Derive the per-window metrics for a set of analysts in a single aggregation —
 * one round trip for a whole Discover page, not one per card.
 *
 * Returns a map keyed by analyst_id. Analysts with no settled history are absent
 * from the map — callers should fall back to emptyAnalystMetrics().
 */
export async function getAnalystMetrics(
  analystIds: string[],
  now: Date = new Date()
): Promise<Map<string, AnalystMetrics>> {
  const result = new Map<string, AnalystMetrics>();
  const ids = [...new Set(analystIds.filter(Boolean))];
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
        analyst_id: { $in: ids },
        status: { $in: CLOSED_TRADE_STATUSES },
        exit_timestamp: { $exists: true, $ne: null },
      },
    },
    { $addFields: { _duration_days: DURATION_DAYS_EXPR } },
    { $facet: facets },
  ]);

  for (const period of PLAN_METRIC_PERIODS) {
    for (const row of (buckets?.[period] ?? []) as any[]) {
      const metrics = result.get(row._id) ?? emptyAnalystMetrics();
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
 * Attach a `metrics` object to each analyst in place, plus flat all-time mirrors
 * on `performance` for the Discover card (which shows a single headline figure
 * and shouldn't have to reach into metrics.all for it).
 *
 * Analysts with no settled trades get a zeroed block rather than a missing key,
 * so the client always has something to render — "no closed trades yet" is a
 * total_trades of 0, not an absent field.
 *
 * `performance.win_rate` is deliberately NOT overwritten here: it is derived
 * from the analyst's stored counters via winRatePercent on every read path, and
 * two different accuracy numbers on one payload would be worse than one that is
 * occasionally a refresh behind. metrics.all.win_rate is the live figure.
 */
export async function attachAnalystMetrics(analysts: any[]): Promise<void> {
  if (!analysts.length) return;
  const byAnalyst = await getAnalystMetrics(analysts.map((a) => a.user_id));
  for (const analyst of analysts) {
    const metrics = byAnalyst.get(analyst.user_id) ?? emptyAnalystMetrics();
    analyst.metrics = metrics;
    analyst.performance = {
      ...(analyst.performance ?? {}),
      // Rounded twin of the stored average_pnl_percent, which the nightly
      // reconciliation job writes unrounded (0.9530270588235294) while
      // trade-service writes it to two decimals — clients were formatting it
      // themselves and getting different answers depending on which job ran last.
      avg_return_percent: metrics.all.avg_return_percent,
      avg_duration_days: metrics.all.avg_duration_days,
    };
  }
}
