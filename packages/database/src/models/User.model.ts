import mongoose, { Schema } from 'mongoose';

const BaseUserSchema = new Schema(
  {
    user_id: { type: String, required: true },
    user_type: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    profile_pic_url: { type: String },
    state: { type: String, required: true },
    state_history: [
      {
        _id: false,
        from_state: String,
        to_state: String,
        timestamp: Date,
        reason: String,
        changed_by: String,
        verification_notes: String,
      },
    ],
    // Optional: the system is OTP-only. Password is reserved for legacy
    // imports and never set by the new register/onboard flows.
    password_hash: { type: String },
    last_login: { type: Date },
    failed_login_attempts: { type: Number, default: 0 },
    locked_until: { type: Date },
    // ── Self-serve account deletion (30-day grace) ──────────────────────────
    // Set when the user requests deletion (state → PENDING_DELETION). The purge
    // job compares deletion_scheduled_at against now; logging in before then
    // cancels the deletion and restores state_before_deletion. All null for a
    // normal account.
    deletion_requested_at: { type: Date, default: null },
    deletion_scheduled_at: { type: Date, default: null },
    deletion_reminder_sent_at: { type: Date, default: null },
    state_before_deletion: { type: String, default: null },
    // ── Dual identity (trader + RA on one phone) ────────────────────────────
    // A human who is both a Research Analyst and a trader owns TWO rows: an
    // ANALYST and an END_USER, each with its own user_id, its own `state` (the
    // two state machines are different enums — an RA can be
    // VERIFICATION_REJECTED while the same person is a KYC-ACTIVE trader) and
    // its own ledger. This points at the other half of the pair; null for the
    // overwhelming majority of accounts, which have only one persona.
    linked_user_id: { type: String, default: null },
  },
  {
    discriminatorKey: 'user_type',
    collection: 'users',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

BaseUserSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    delete ret.password_hash;
    delete ret.mfa_secret;
    delete ret.__v;
    return ret;
  },
});

BaseUserSchema.index({ user_id: 1 }, { unique: true });

// ── Dual identity: uniqueness is per (contact, persona), not per contact ─────
// One phone may back at most one END_USER row AND at most one ANALYST row —
// never two of the same type. That is a *narrower* guarantee than a plain
// unique index on `phone` in the dimension that matters (you still cannot have
// two traders on one number) while permitting the RA-who-also-trades case.
//
// These MUST be partial, not sparse. A sparse COMPOUND index only skips a
// document when *every* indexed field is missing, and `user_type` is
// `required: true` — so a sparse {phone, user_type} index would happily index
// every phone-less row as (null, 'END_USER') and the second such row would
// collide. partialFilterExpression indexes only the rows that actually carry
// the field, which is what we want.
BaseUserSchema.index(
  { email: 1, user_type: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
BaseUserSchema.index(
  { phone: 1, user_type: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);

// Resolving the other half of a linked trader/analyst pair.
BaseUserSchema.index(
  { linked_user_id: 1 },
  { partialFilterExpression: { linked_user_id: { $type: 'string' } } }
);

BaseUserSchema.index({ sebi_license_number: 1 }, { unique: true, sparse: true });
BaseUserSchema.index({ user_type: 1, state: 1 });
// Drives the daily account-deletion job's reminder + purge sweeps (finds
// PENDING_DELETION rows due for a reminder / purge). Sparse: only set on the
// small set of accounts in the deletion grace window.
BaseUserSchema.index({ state: 1, deletion_scheduled_at: 1 }, { sparse: true });

export const User = mongoose.model('User', BaseUserSchema);

export const EndUser = User.discriminator(
  'END_USER',
  new Schema({
    // Discover personalisation (User Flow §2.5). Multi-select, skippable —
    // an empty list means "show all analysts". Values map to analyst
    // segments_covered (EQUITY, FNO) and horizons_covered (INTRADAY, SWING,
    // LONG_TERM); mirrors TradeSegment + TradeCategory in shared-types.
    interests: {
      type: [String],
      enum: ['EQUITY', 'FNO', 'INTRADAY', 'SWING', 'LONG_TERM'],
      default: [],
    },
    kyc: {
      aadhaar_verified: Boolean,
      digilocker_response: Schema.Types.Mixed,
      verified_at: Date,
      verification_attempts: { type: Number, default: 0 },
    },
    suspicious_flags: [
      {
        _id: false,
        flag_type: String,
        timestamp: Date,
        details: Schema.Types.Mixed,
        resolved: { type: Boolean, default: false },
      },
    ],
    rate_limit_metadata: {
      request_count_today: { type: Number, default: 0 },
      last_reset: Date,
    },
  })
);

export const Analyst = User.discriminator(
  'ANALYST',
  new Schema({
    sebi_license_number: { type: String },
    sebi_license_doc_url: String,
    aadhar_doc_url: String,
    pan_doc_url: String,
    company_name: String,
    company_location: String,
    business_type: String,
    registration_type: { type: String, enum: ['research_analyst', 'investment_advisors'] },
    asset_under_research_cr: Number,
    number_of_clients: Number,
    website: String,
    bio: String,
    twitter_url: String,
    linkedin_url: String,
    experience_years: Number,
    specialization: [String],
    verification: {
      submitted_at: Date,
      assigned_to: String,
      assigned_at: Date,
      reviewed_at: Date,
      rejection_reason: String,
      documents: [
        { type: { type: String }, url: String, uploaded_at: Date },
      ],
    },
    performance: {
      total_trades: { type: Number, default: 0 },
      winning_trades: { type: Number, default: 0 },
      average_pnl_percent: { type: Number, default: 0 },
      total_subscribers: { type: Number, default: 0 },
      last_calculated: Date,
    },
    onboarded_by: String,
    // Maximum number of Telegram broadcasts this analyst may send per calendar
    // day (IST). Enforced in the notification-service worker via Redis INCR on
    // the key `telegram_daily:{analyst_id}:{YYYY-MM-DD}` with a 24-h TTL.
    // Admins can override per-analyst via PATCH /admin/analysts/:id/telegram-limit.
    telegram_daily_limit: { type: Number, default: 5 },
  })
);

export const InternalTeamUser = User.discriminator(
  'INTERNAL_TEAM',
  new Schema({
    assigned_role: { type: String, required: true },
    mfa_enabled: { type: Boolean, default: false },
    mfa_secret: String,
  })
);
