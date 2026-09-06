interface TraderKycEvidence {
  user_type?: unknown;
  kyc?: {
    status?: unknown;
    provider?: unknown;
    method?: unknown;
    aadhaar_verified?: unknown;
    evidence_id?: unknown;
    verified_at?: unknown;
  };
}

/** Verification flags from legacy/mock flows are insufficient for activation. */
export function hasVerifiedTraderKyc(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false;
  const trader = user as TraderKycEvidence;
  const evidence = trader.kyc;
  if (trader.user_type !== 'END_USER' || !evidence) return false;

  return evidence.status === 'VERIFIED'
    && evidence.provider === 'DEEPVUE'
    && evidence.method === 'DIGILOCKER'
    && evidence.aadhaar_verified === true
    && typeof evidence.evidence_id === 'string'
    && evidence.evidence_id.trim().length > 0
    && evidence.verified_at instanceof Date
    && Number.isFinite(evidence.verified_at.getTime());
}

/** Repeat the evidence requirement in atomic activation writes. */
export function traderActivationFilter() {
  return {
    user_type: 'END_USER',
    'kyc.status': 'VERIFIED',
    'kyc.provider': 'DEEPVUE',
    'kyc.method': 'DIGILOCKER',
    'kyc.aadhaar_verified': true,
    'kyc.evidence_id': { $type: 'string' as const, $regex: /\S/ },
    'kyc.verified_at': { $type: 'date' as const },
  };
}

// Base User queries do not inherit a discriminator's select:false settings.
// Apply this explicitly whenever a base-model profile is returned by an API.
export const TRADER_KYC_PRIVATE_PROJECTION =
  '-kyc.digilocker_response -kyc.identity_encrypted -kyc.digilocker_subject_hash -kyc.activation_event';
