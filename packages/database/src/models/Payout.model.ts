import mongoose, { Schema } from 'mongoose';

const PayoutSchema = new Schema(
  {
    raId: { type: String, required: true },
    grossAmount: { type: Number, required: true },
    netAmount: { type: Number, required: true }, // Same as grossAmount for MVP
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'RABankAccount', required: true },
    razorpayPayoutId: { type: String },
    utr: { type: String },
    mode: { type: String, enum: ['imps', 'neft'], required: true },
    status: {
      type: String,
      enum: ['initiated', 'processing', 'processed', 'failed'],
      required: true,
    },
    failureReason: { type: String },
    initiatedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    failedAt: { type: Date },
    retryCount: { type: Number, default: 0 },
    notes: { type: String },
    isFrozen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PayoutSchema.index({ raId: 1, createdAt: -1 });
PayoutSchema.index({ status: 1 });

export const Payout = mongoose.model('Payout', PayoutSchema);
