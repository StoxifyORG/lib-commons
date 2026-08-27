import mongoose, { Schema } from 'mongoose';

const BaseTradeSchema = new Schema(
  {
    trade_id: { type: String, required: true, unique: true },
    trade_type: { type: String, required: true },
    analyst_id: { type: String, required: true },
    analyst_name: { type: String, required: true },
    segment: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, default: 'LIVE' },
    entry_timestamp: { type: Date, required: true, default: Date.now },
    nse_timestamp: { type: Date, required: true, default: Date.now, immutable: true },
    exit_timestamp: Date,
    manual_closing_note: String,
    target_note: String,
    rationale: { type: String, maxlength: 500 },
    batch: Schema.Types.Mixed,
    plan_id: { type: String, index: true, required: true },
    // Every plan/batch this trade is published to, including plan_id. A trade
    // published to N batches is ONE document visible to all N batches'
    // subscribers, rather than N duplicate documents. plan_id stays as the
    // first entry for back-compat with anything still reading it directly.
    // Absent on documents created before multi-batch publish existed — callers
    // must fall back to [plan_id] in that case.
    plan_ids: { type: [String], index: true },
    version: { type: Number, default: 1 },
    last_modified_by: String,
    // ── Telegram publishing ────────────────────────────────────────────────────
    // Captured immutably at trade-creation time. Drives the notification-service
    // telegram worker — if true, TRADE_PUBLISHED, TRADE_MODIFIED, SL_HIT, and
    // target-hit events are broadcast to the analyst's Telegram channel.
    // telegram_message_id / telegram_chat_id are no longer stored here; they
    // live in the isolated telegram_db (5-year SEBI retention) so the trades
    // collection stays free of ephemeral delivery state.
    share_on_telegram: { type: Boolean, default: false, immutable: true },
    modification_history: [
      {
        _id: false,
        modified_at: Date,
        modified_by: String,
        fields_changed: Schema.Types.Mixed,
        reason: String,
      },
    ],
    // Set by autoCloseTrade when a trade is closed by the market-data engine.
    // Not set for manually closed trades (those use status 'MANUALLY_CLOSED').
    // Pre-fix documents will have this field absent — report handles gracefully via || ''.
    closure_type: {
      type: String,
      enum: ['CLOSED_BY_SL', 'CLOSED_BY_TARGET', 'MANUALLY_CLOSED', 'PARTIAL_TARGET_HIT'],
    },
  },
  { discriminatorKey: 'trade_type', collection: 'trades' }
);

BaseTradeSchema.index({ analyst_id: 1, status: 1 });
// Public track record: closed trades for one analyst, newest exit first. The
// sort key is part of the index so an unauthenticated caller paging deep into
// an all-time history never triggers an in-memory sort.
BaseTradeSchema.index({ analyst_id: 1, status: 1, exit_timestamp: -1 });
BaseTradeSchema.index({ status: 1, entry_timestamp: 1 });
BaseTradeSchema.index({ symbol: 1, status: 1 });
BaseTradeSchema.index({ 'leg1.symbol': 1, status: 1 });
BaseTradeSchema.index({ 'leg2.symbol': 1, status: 1 });

export const Trade = mongoose.model('Trade', BaseTradeSchema);

export const SimpleTrade = Trade.discriminator(
  'SIMPLE',
  new Schema({
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    direction: { type: String, required: true },
    entry_price: { type: Number, required: true },
    stop_loss: { type: Number, required: true },
    target: { type: Number },
    targets: [{
      _id: false,
      target_price: { type: Number, required: true },
      book_percent: { type: Number, required: true },
    }],
    hit_targets: [Number],
    running_pnl_percent: Number,
    exit_price: Number,
    pnl_percent: Number,
    expiry: String,
    strike_price: Number,
    option_type: String,
  })
);

export const PairTrade = Trade.discriminator(
  'PAIR',
  new Schema({
    leg1: {
      symbol: String,
      name: String,
      direction: String,
      entry_price: Number,
      stop_loss: Number,
      target: Number,
      targets: [{
        _id: false,
        target_price: { type: Number, required: true },
        book_percent: { type: Number, required: true },
      }],
      hit_targets: [Number],
      exit_price: Number,
    },
    leg2: {
      symbol: String,
      name: String,
      direction: String,
      entry_price: Number,
      stop_loss: Number,
      target: Number,
      targets: [{
        _id: false,
        target_price: { type: Number, required: true },
        book_percent: { type: Number, required: true },
      }],
      hit_targets: [Number],
      exit_price: Number,
    },
    combined_pnl_percent: Number,
  })
);
