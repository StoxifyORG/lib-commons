import mongoose, { Schema } from 'mongoose';

const PaymentSchema = new Schema(
  {
    transaction_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    subscription_id: { type: String, required: true },
    plan_id: { type: String },
    batch_id: { type: String },
    analyst_id: { type: String, required: true },
    
    // Core MVP Fields
    grossAmount: { type: Number, required: true }, // Total paid by investor
    platformCommission: { type: Number, required: true }, // 10%
    raGrossEarning: { type: Number, required: true }, // 90%
    dailyEarnRate: { type: Number, required: true }, // raGrossEarning / plan.durationDays
    lastSettledDays: { type: Number, default: 0 },
    
    status: {
      type: String,
      enum: ['CREATED', 'CAPTURED', 'FAILED', 'REFUNDED'],
      required: true,
    },
    currency: { type: String, default: 'INR' },
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

PaymentSchema.index({ user_id: 1, created_at: -1 });
PaymentSchema.index({ subscription_id: 1 });
PaymentSchema.index({ analyst_id: 1 });

export const Payment = mongoose.model('Payment', PaymentSchema);
