import mongoose, { Schema } from 'mongoose';

const IpBlockSchema = new Schema(
  {
    ip_address: { type: String, required: true },
    reason: { type: String, required: true },
    blocked_by: { type: String, required: true },     // user_id of the admin
    blocked_at: { type: Date, default: Date.now },
    // null = permanent. If set, TTL index auto-removes after expiry.
    expires_at: { type: Date },
  }
);

// Mongo's TTL index removes the doc once expires_at is reached.
// `partialFilterExpression` only applies the TTL to docs that have expires_at set.
IpBlockSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expires_at: { $exists: true } } }
);
IpBlockSchema.index({ ip_address: 1 }, { unique: true });

export const IpBlock = mongoose.model('IpBlock', IpBlockSchema);
