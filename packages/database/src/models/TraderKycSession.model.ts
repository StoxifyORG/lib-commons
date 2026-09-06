import mongoose, { InferSchemaType, Schema } from 'mongoose';

const TraderKycConsentSchema = new Schema(
  {
    version: { type: String, required: true },
    purpose: { type: String, required: true },
    accepted_at: { type: Date, required: true },
  },
  { _id: false }
);

// Internal verification attempts. API handlers return an explicit safe status
// projection; this document must never be serialized directly to a client.
const TraderKycSessionSchema = new Schema(
  {
    session_id: { type: String, required: true },
    user_id: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [
        'INITIATING',
        'AWAITING_AUTHORIZATION',
        'PROCESSING',
        'READY',
        'VERIFIED',
        'FAILED',
        'EXPIRED',
      ],
    },
    provider_transaction_id: String,
    callback_state_hash: { type: String, required: true },
    authorization_url: String,
    consent: { type: TraderKycConsentSchema, required: true },
    expires_at: { type: Date, required: true },
    // Logical expiry is enforced by the service. Mongo's asynchronous TTL
    // deletion cleans up the attempt later, after its recovery window.
    purge_at: { type: Date, required: true },
    encrypted_result: String,
    failure_code: String,
    processing_token: String,
    verified_at: Date,
  },
  {
    collection: 'trader_kyc_sessions',
    timestamps: { createdAt: 'created_at' as const, updatedAt: 'updated_at' as const },
  }
);

TraderKycSessionSchema.index({ session_id: 1 }, { unique: true });
TraderKycSessionSchema.index({ user_id: 1, created_at: -1 });
TraderKycSessionSchema.index({ purge_at: 1 }, { expireAfterSeconds: 0 });

export type TraderKycSessionRecord = InferSchemaType<typeof TraderKycSessionSchema>;
export const TraderKycSession = mongoose.model('TraderKycSession', TraderKycSessionSchema);
