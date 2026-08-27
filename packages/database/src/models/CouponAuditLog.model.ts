import mongoose, { Schema } from 'mongoose';

const CouponAuditLogSchema = new Schema(
  {
    coupon_id: { type: String, required: true },
    user_id: { type: String, required: true },
    action: { 
      type: String, 
      enum: ['CREATED', 'UPDATED', 'RESERVED', 'REDEEMED', 'REFUNDED', 'DELETED'], 
      required: true 
    },
    details: { type: Schema.Types.Mixed, default: {} },
    ip_address: { type: String },
    device_id: { type: String }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

CouponAuditLogSchema.index({ coupon_id: 1, created_at: -1 });
CouponAuditLogSchema.index({ user_id: 1, action: 1 });

export const CouponAuditLog = mongoose.model('CouponAuditLog', CouponAuditLogSchema);
