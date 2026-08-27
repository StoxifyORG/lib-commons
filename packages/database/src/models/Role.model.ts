import mongoose, { Schema } from 'mongoose';

const RoleSchema = new Schema(
  {
    role_id: { type: String, required: true },
    role_name: { type: String, required: true },
    description: String,
    powers: [String],
    is_system_role: { type: Boolean, default: false },
    created_by: String,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

RoleSchema.pre('deleteOne', { document: true, query: true }, function (this: any, next: any) {
  const doc = this as any;
  if (doc.is_system_role) {
    next(new Error('Cannot delete a system role'));
  } else {
    next();
  }
});

RoleSchema.index({ role_id: 1 }, { unique: true });
RoleSchema.index({ role_name: 1 }, { unique: true });

export const Role = mongoose.model('Role', RoleSchema);
