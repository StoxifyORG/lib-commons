import mongoose, { Schema } from 'mongoose';

const UserRoleSchema = new Schema(
  {
    user_id: { type: String, required: true },
    role_id: { type: String, required: true },
    assigned_at: { type: Date, required: true, default: Date.now },
    assigned_by: { type: String, required: true },
    expires_at: { type: Date },
    is_active: { type: Boolean, default: true },
    // Set when an admin revokes the assignment (POST /rbac/revoke-role). The row
    // is kept with is_active:false rather than deleted so the grant/revoke trail
    // survives for audit.
    revoked_at: { type: Date },
    revoked_by: { type: String },
  }
);

UserRoleSchema.index({ user_id: 1, is_active: 1 });
UserRoleSchema.index({ role_id: 1, is_active: 1 });

export const UserRole = mongoose.model('UserRole', UserRoleSchema);
