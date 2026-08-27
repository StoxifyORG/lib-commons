import mongoose, { Schema } from 'mongoose';

/**
 * Marketing-site waitlist capture. These are NOT users — nobody here has an
 * account, a phone number, or a session. It is only an email somebody typed
 * into a landing-page form so the sales team can reach out.
 *
 * Kept deliberately separate from the `users` collection: a waitlist row has no
 * state machine, no RBAC role, and no PII beyond the email, so it must never be
 * picked up by anything that sweeps users (deletion job, RBAC seeds, analytics
 * counts).
 */
const WaitlistEntrySchema = new Schema(
  {
    waitlist_id: { type: String, required: true, unique: true },
    // Always stored lowercased+trimmed by the service so the unique index below
    // actually dedupes ("A@b.com" and "a@b.com" are the same person).
    email: { type: String, required: true },
    // Which form it came from, so sales can tell an RA lead apart from a trader
    // lead. Open-ended on purpose — adding a new form should not need a schema
    // change, just a new string.
    source: { type: String, required: true, default: 'LANDING' },
    // Reserved for outreach tracking. Nothing writes CONTACTED yet; the field
    // exists now so adding a "mark contacted" button later needs no migration.
    status: { type: String, enum: ['NEW', 'CONTACTED'], default: 'NEW' },
    // Abuse forensics only — never surfaced in the admin table.
    ip: { type: String },
    user_agent: { type: String },
  },
  {
    collection: 'waitlist_entries',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// One row per email address. The public endpoint upserts on this, so a visitor
// re-submitting the same address refreshes their row instead of erroring.
WaitlistEntrySchema.index({ email: 1 }, { unique: true });
// Drives the admin table's default ordering (newest lead first) and the
// "signed up in the last N days" metric tiles.
WaitlistEntrySchema.index({ created_at: -1 });
// Source filter in the admin table.
WaitlistEntrySchema.index({ source: 1, created_at: -1 });

export const WaitlistEntry = mongoose.model('WaitlistEntry', WaitlistEntrySchema);
