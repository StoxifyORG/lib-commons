import mongoose, { Schema } from 'mongoose';

const SessionSchema = new Schema(
  {
    session_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    device_id: { type: String, required: true },
    token_hash: { type: String, required: true },
    refresh_token_hash: { type: String, required: true },
    // B-5 FIX: keeps the previous hash for 30s so concurrent refreshes from
    // multiple tabs don't get incorrectly logged as token theft and force-logged out.
    previous_refresh_token_hash: { type: String },
    token_family: { type: String },
    device_type: String,
    device_name: String,
    ip_address: { type: String, required: true },
    user_agent: String,
    created_at: { type: Date, default: Date.now },
    last_active: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
    is_revoked: { type: Boolean, default: false },
    revoked_at: Date,
    revoked_reason: String,
    last_refreshed_at: Date,
  }
);

SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ user_id: 1, is_revoked: 1 });
SessionSchema.index({ token_hash: 1 });
SessionSchema.index({ refresh_token_hash: 1, is_revoked: 1 });
SessionSchema.index({ previous_refresh_token_hash: 1 }, { sparse: true });

export const Session = mongoose.model('Session', SessionSchema);
