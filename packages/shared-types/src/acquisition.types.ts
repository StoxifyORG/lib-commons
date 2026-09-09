export type AnalystAcquisitionStage =
  | 'PENDING_VERIFICATION'
  | 'APPROVED'
  | 'ACTIVATED'
  | 'FIRST_SUBSCRIBER'
  | 'SILENT';

export interface AnalystAcquisitionRow {
  user_id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  company_location: string;
  website?: string;
  linkedin_url?: string;
  twitter_url?: string;
  experience_years?: number | null;
  specialization?: string[];
  registration_type?: string;
  registered_at?: string | null;
  sebi_license_number: string;
  stage: AnalystAcquisitionStage;
  approved_at: string | null;
  first_trade_date: string | null;
  last_trade_date: string | null;
  subscriber_count: number;
  earnings_to_date: number;
  days_to_activation: number | null;
}

export interface AnalystAcquisitionSummary {
  funnel: {
    in_verification_queue: number;
    approved: number;
    activated: number;
    with_first_subscriber: number;
    silent: number;
  };
  rates: {
    queue_to_approved_pct: number;
    approved_to_activated_pct: number;
    activated_to_subscriber_pct: number;
    silent_rate_pct: number;
    first_subscriber_rate: number;
  };
  median_activation_days: number;
  analysts: AnalystAcquisitionRow[];
  generated_at: string;
}
