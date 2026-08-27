import mongoose, { Schema } from 'mongoose';

const TradeAuditLogSchema = new Schema({
  trade_id: { type: String, required: true, index: true },
  event_type: { type: String, required: true }, // CREATED, MODIFIED, CLOSED_SL, etc.
  actor: { type: String, required: true }, // user_id or 'AUTO_CLOSE_ENGINE'
  ltp_at_event: { type: Number },
  trade_version_before: { type: Number },
  trade_version_after: { type: Number },
  details: { type: Schema.Types.Mixed },
  created_at: { type: Date, required: true, default: Date.now },
});

export const TradeAuditLog = mongoose.model('TradeAuditLog', TradeAuditLogSchema);
