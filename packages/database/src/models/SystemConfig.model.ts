import mongoose, { Schema } from 'mongoose';

/// Runtime configuration that admins flip from the admin panel without a
/// redeploy. One doc per key; `value` is arbitrary JSON so a key can hold a
/// boolean flag, a number limit, or a nested object.
///
/// Services read these through `getSystemConfigValue()` (see ../systemConfig),
/// which memoises for a few seconds — expect a toggle to take effect within
/// that window rather than instantly.
const SystemConfigSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    category: { type: String },
    description: { type: String },
    updated_by: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

SystemConfigSchema.index({ key: 1 }, { unique: true });

export const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);
