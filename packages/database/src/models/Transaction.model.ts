import mongoose, { Schema } from 'mongoose';

const TransactionSchema = new Schema(
  {
    transaction_id: { type: String, required: true, unique: true },
    // PAYMENT — money in (subscription purchase / renewal)
    // REFUND  — money out (admin-initiated refund of a prior PAYMENT)
    type: { type: String, enum: ['PAYMENT', 'REFUND'], required: true },
    // CREATED   — order created, awaiting capture
    // CAPTURED  — payment captured (money received)
    // FAILED    — payment attempt failed / abandoned
    // REFUNDED  — a captured PAYMENT that has since been refunded
    status: {
      type: String,
      enum: ['CREATED', 'CAPTURED', 'FAILED', 'REFUNDED'],
      required: true,
    },
    user_id: { type: String, required: true },
    subscription_id: { type: String, required: true },
    plan_id: { type: String },
    batch_id: { type: String },
    analyst_id: { type: String },
    analyst_name: { type: String },
    plan_name: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    coupon_applied: { type: String },
    discount_amount: { type: Number },
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_refund_id: { type: String },
    // For REFUND rows: the transaction_id of the original PAYMENT being refunded.
    refund_of: { type: String },
    reason: { type: String },
    created_by: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

TransactionSchema.index({ user_id: 1, created_at: -1 });
TransactionSchema.index({ subscription_id: 1 });
TransactionSchema.index({ razorpay_order_id: 1 });
TransactionSchema.index({ razorpay_payment_id: 1 });

export const Transaction = mongoose.model('Transaction', TransactionSchema);
