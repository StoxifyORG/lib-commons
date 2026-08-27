import mongoose, { Schema } from 'mongoose';

const SubscriptionSchema = new Schema(
  {
    subscription_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true },
    plan_id: { type: String, required: true },
    plan_name: { type: String },
    batch_id: { type: String },
    batch_name: { type: String },
    analyst_id: { type: String, required: true },
    analyst_name: { type: String },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    status: {
      type: String,
      // PENDING        — order created, awaiting Razorpay payment confirmation
      // PAYMENT_FAILED — payment attempt failed / abandoned before capture
      enum: ['PENDING', 'ACTIVE', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED'],
      required: true,
      default: 'ACTIVE',
    },
    auto_renew: { type: Boolean, default: false },
    cancelled_at: { type: Date },
    cancellation_reason: { type: String },
    coupon_applied: { type: String },
    discount_amount: { type: Number },
    payment: {
      amount: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
      transaction_id: { type: String },
      razorpay_order_id: { type: String },
      razorpay_payment_id: { type: String },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

SubscriptionSchema.index({ user_id: 1, status: 1 });
SubscriptionSchema.index({ plan_id: 1, status: 1 });
SubscriptionSchema.index({ plan_id: 1, batch_id: 1, status: 1 });
SubscriptionSchema.index({ analyst_id: 1, status: 1 });
SubscriptionSchema.index({ end_date: 1, status: 1 });
SubscriptionSchema.index({ status: 1, end_date: 1 });

export const Subscription = mongoose.model('Subscription', SubscriptionSchema);
