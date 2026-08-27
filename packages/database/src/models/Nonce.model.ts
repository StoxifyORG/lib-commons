import mongoose, { Schema } from 'mongoose';

const NonceSchema = new Schema(
  {
    device_id: { type: String, required: true },
    nonce: { type: String, required: true },
    date: { type: String, required: true },
    used_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
  }
);

NonceSchema.index({ device_id: 1, nonce: 1, date: 1 }, { unique: true });
NonceSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const Nonce = mongoose.model('Nonce', NonceSchema);
