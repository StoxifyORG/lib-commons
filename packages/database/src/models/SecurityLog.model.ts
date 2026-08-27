import mongoose, { Schema } from 'mongoose';

const SecurityLogSchema = new Schema(
  {
    log_id: { type: String, required: true },
    incident_type: { type: String, required: true },
    severity: { type: String, required: true },
    user_id: String,
    device_id: String,
    ip_address: { type: String, required: true },
    request_method: String,
    request_url: String,
    request_headers: Schema.Types.Mixed,
    request_body: Schema.Types.Mixed,
    description: { type: String, required: true },
    stack_trace: String,
    action_taken: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    service_name: { type: String, required: true },
  }
);

SecurityLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('SecurityLog is append-only');
});
SecurityLogSchema.pre('updateOne', function () {
  throw new Error('SecurityLog is append-only');
});

SecurityLogSchema.index({ timestamp: -1 });
SecurityLogSchema.index({ user_id: 1, timestamp: -1 });
SecurityLogSchema.index({ incident_type: 1, severity: 1 });
SecurityLogSchema.index({ ip_address: 1, timestamp: -1 });

export const SecurityLog = mongoose.model('SecurityLog', SecurityLogSchema);
