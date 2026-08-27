import mongoose, { Schema } from 'mongoose';

const CouponSchema = new Schema(
  {
    coupon_id: { type: String, required: true, unique: true },
    analyst_id: { type: String, required: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['PERCENTAGE', 'FLAT'], required: true },
    discount_value: { type: Number, required: true },
    plan_ids: { type: [String], default: [] },
    user_ids: { type: [String], default: [] },
    // EVERYONE — any subscriber; NEW_USER — never completed a subscription with
    // this analyst; EXISTING_USER — has completed one; SPECIFIC — listed user_ids only
    availability: {
      type: String,
      enum: ['EVERYONE', 'NEW_USER', 'EXISTING_USER', 'SPECIFIC'],
      default: 'EVERYONE',
    },
    quantity_total: { type: Number, default: null }, // null means unlimited
    quantity_used: { type: Number, default: 0 },
    valid_from: { type: Date },
    valid_to: { type: Date },
    is_case_insensitive: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    status: { 
      type: String, 
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED', 'REFUNDED'], 
      default: 'ACTIVE' 
    },
    min_purchase: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    billing_cycles: { type: [String], default: [] },
    is_stackable: { type: Boolean, default: false },
    max_coupons_per_checkout: { type: Number, default: 1 },
    restore_on_refund: { type: Boolean, default: false },
    restore_on_cancel: { type: Boolean, default: false },
    per_user_limit: { type: Number, default: null }, // null = unlimited; positive integer when set
    max_discount: { type: Number, default: null },   // null = no cap; positive number when set
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// We should ensure a code is unique per analyst, but depending on case sensitivity,
// this could be complex. For now, a simple compound index:
CouponSchema.index({ analyst_id: 1, code: 1 });
CouponSchema.index({ analyst_id: 1, is_active: 1 });

export const Coupon = mongoose.model('Coupon', CouponSchema);
