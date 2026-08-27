import mongoose, { Schema } from 'mongoose';

/**
 * An analyst's payout destination.
 *
 * Rows are IMMUTABLE once submitted: a "change bank details" is a brand-new row,
 * never an update. The previously VERIFIED row keeps `isActive: true` (and keeps
 * receiving payouts) until the new row is approved by a reviewer, so an account
 * takeover that submits new details can't silently redirect money.
 *
 * Verification is a state machine, not a boolean:
 *
 *   PENDING_REVIEW → VERIFIED     (reviewer approved the proof document)
 *                  → REJECTED     (reviewer rejected, with a reason)
 *
 * `verificationMethod` records HOW it was verified. Today that's MANUAL_DOC (a
 * human compared the uploaded proof against the typed values) or FIRST_TRANSFER
 * (a small real credit landed and was confirmed). When a penny-drop API is
 * integrated, only the writer of this field changes — states, gates, and UI
 * stay exactly as they are.
 */
const RABankAccountSchema = new Schema(
  {
    raId: { type: String, required: true },

    // ── Account details ──────────────────────────────────────────────────────
    accountHolderName: { type: String, required: true },
    // AES-256-GCM ciphertext (auth-utils encryptAES). Never returned to clients.
    accountNumber: { type: String, required: true },
    // Plaintext last 4 so the UI can render "••••9382" without ever decrypting.
    accountNumberLast4: { type: String, required: true },
    // sha256(normalisedAccountNumber + ifsc). Lets us detect the same bank
    // account attached to multiple analysts (mule signal) without decrypting.
    accountFingerprint: { type: String, required: true },
    ifsc: {
      type: String,
      required: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'],
    },
    // Resolved from the public IFSC directory at submit time — display only.
    bankName: { type: String },
    branchName: { type: String },
    accountType: { type: String, enum: ['savings', 'current'], required: true },
    pan: { type: String, required: true },
    gst: { type: String },

    // ── Proof document ───────────────────────────────────────────────────────
    // Blob path (NOT a public URL) inside the private documents container.
    // Readable only through a short-lived SAS minted for a compliance reviewer.
    proofDocBlob: { type: String, required: true },
    proofDocType: {
      type: String,
      enum: ['cancelled_cheque', 'passbook', 'bank_statement'],
      required: true,
    },
    proofDocContentType: { type: String },

    // ── Verification state ───────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'],
      default: 'PENDING_REVIEW',
      required: true,
    },
    verificationMethod: {
      type: String,
      enum: ['MANUAL_DOC', 'FIRST_TRANSFER', 'PENNY_DROP'],
    },
    // 0–100 similarity between accountHolderName and the name on record.
    // Advisory only: shown to the reviewer, never auto-approves.
    nameMatchScore: { type: Number },

    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: String },
    rejectionReason: { type: String },
    // Snapshot of the reviewer's checklist — the audit evidence that a human
    // actually looked at the document, and what they concluded.
    reviewChecklist: {
      nameMatches: { type: Boolean },
      accountNumberMatches: { type: Boolean },
      ifscMatches: { type: Boolean },
      documentLegible: { type: Boolean },
      documentUnaltered: { type: Boolean },
    },

    // Cooling-off: withdrawals stay blocked until this timestamp even once the
    // account is VERIFIED, so a takeover can't approve-and-drain in one sitting.
    payoutsUnlockedAt: { type: Date },

    // ── Money movement ───────────────────────────────────────────────────────
    // The account payouts actually go to. At most one active row per analyst.
    isActive: { type: Boolean, default: false },

    // Reserved for the eventual Razorpay/Cashfree integration. Unused today —
    // nothing gates on these.
    razorpayContactId: { type: String },
    razorpayFundAccountId: { type: String },
  },
  { timestamps: true }
);

RABankAccountSchema.index({ raId: 1, createdAt: -1 });
RABankAccountSchema.index({ raId: 1, isActive: 1 });
RABankAccountSchema.index({ status: 1, submittedAt: 1 });
RABankAccountSchema.index({ accountFingerprint: 1 });

export const RABankAccount = mongoose.model('RABankAccount', RABankAccountSchema);
