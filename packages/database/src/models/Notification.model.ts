import mongoose, { Schema } from 'mongoose';

const NotificationSchema = new Schema(
  {
    notification_id: { type: String, required: true },
    user_id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    // Set when this notification was fanned out from an admin broadcast — lets
    // the admin reconstruct "what broadcasts did we send" without scanning rows.
    broadcast_id: { type: String },
    broadcast_sent_by: { type: String },
    related_entity_type: String,
    related_entity_id: String,
    channels: {
      _id: false,
      websocket: { sent: Boolean, sent_at: Date },
      push: { sent: Boolean, sent_at: Date, delivery_status: String },
      email: { sent: Boolean, sent_at: Date, delivery_status: String },
    },
    priority: { type: String, enum: ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'], default: 'NORMAL' },
    payload: { type: Schema.Types.Mixed },
    status: { 
      type: String, 
      enum: ['PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RETRYING'], 
      default: 'PENDING' 
    },
    scheduled_at: Date,
    template_version: String,
    idempotency_key: String,
    metadata: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
    read_at: Date,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    expires_at: { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

NotificationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
NotificationSchema.index({ user_id: 1, read: 1, created_at: -1 });
NotificationSchema.index({ related_entity_id: 1 });
NotificationSchema.index(
  { broadcast_id: 1 },
  { sparse: true }
);
NotificationSchema.index(
  { idempotency_key: 1 },
  { sparse: true, unique: true }
);

export const Notification = mongoose.model('Notification', NotificationSchema);
