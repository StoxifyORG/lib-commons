import mongoose, { Schema } from 'mongoose';

/// A user's bookmark of a published trade. Stored as a lightweight reference
/// (user_id + trade_id) rather than a snapshot, so the saved list always
/// reflects the trade's current lifecycle state and P&L when hydrated against
/// the Trade collection.
const SavedTradeSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    trade_id: { type: String, required: true },
    analyst_id: { type: String },
    saved_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One bookmark per (user, trade); makes save idempotent via upsert.
SavedTradeSchema.index({ user_id: 1, trade_id: 1 }, { unique: true });
// Newest-saved-first listing for a user.
SavedTradeSchema.index({ user_id: 1, saved_at: -1 });

export const SavedTrade = mongoose.model('SavedTrade', SavedTradeSchema);
