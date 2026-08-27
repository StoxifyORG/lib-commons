import mongoose, { Schema } from 'mongoose';

const DeviceTokenSchema = new Schema(
  {
    userId: { type: String, required: true },
    deviceId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    appVersion: { type: String },
    osVersion: { type: String },
    timezone: { type: String },
    locale: { type: String },
    lastSeen: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DeviceTokenSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
DeviceTokenSchema.index({ token: 1 });

export const DeviceToken = mongoose.model('DeviceToken', DeviceTokenSchema);
