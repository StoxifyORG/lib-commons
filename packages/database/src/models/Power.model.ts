import mongoose, { Schema } from 'mongoose';

const PowerSchema = new Schema(
  {
    power_id: { type: String, required: true },
    power_name: { type: String, required: true },
    description: String,
    category: String,
    is_system_power: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  }
);

PowerSchema.index({ power_id: 1 }, { unique: true });
PowerSchema.index({ power_name: 1 }, { unique: true });
PowerSchema.index({ category: 1 });

export const Power = mongoose.model('Power', PowerSchema);
