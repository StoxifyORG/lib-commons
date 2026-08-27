import mongoose, { Schema } from 'mongoose';

const PlanSchema = new Schema(
  {
    plan_id: { type: String, required: true, unique: true },
    analyst_id: { type: String, required: true },
    analyst_name: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    risk_level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    days: { type: Number, required: true },
    price: { type: Number, required: true },
    segments: { type: [String], required: true, default: ['EQUITY'] },
    horizons: { type: [String], required: true, default: ['INTRADAY'] },
    features: [String],
    max_trades_per_day: Number,
    is_active: { type: Boolean, default: true },
    batches: {
      type: [
        {
          _id: false,
          batch_id: { type: String, required: true },
          name: { type: String, required: true },
          plan_type: { type: String, enum: ['SUBSCRIPTION', 'LIFETIME'], required: true, default: 'SUBSCRIPTION' },
          price: { type: Number, required: true },
          discounted_price: { type: Number },
          days: { type: Number }, // Made optional as LIFETIME may not have days, though old ones do
          billing_cycle: { type: String, required: true },
          description: { type: String },
          is_active: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    created_by: String,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

PlanSchema.index({ analyst_id: 1, is_active: 1 });
PlanSchema.index({ segments: 1, is_active: 1 });
// Back the discovery filters/sorts added for the Discover surface.
PlanSchema.index({ is_active: 1, risk_level: 1 });
PlanSchema.index({ is_active: 1, horizons: 1 });
PlanSchema.index({ is_active: 1, price: 1 });

export const Plan = mongoose.model('Plan', PlanSchema);
