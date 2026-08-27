import { Power } from '../models/Power.model';

const POWERS = [
  { power_id: 'PWR_TRADE_CREATE', power_name: 'TRADE_CREATE', category: 'TRADE' },
  { power_id: 'PWR_TRADE_MODIFY', power_name: 'TRADE_MODIFY', category: 'TRADE' },
  { power_id: 'PWR_TRADE_CLOSE', power_name: 'TRADE_CLOSE', category: 'TRADE' },
  { power_id: 'PWR_TRADE_READ_OWN', power_name: 'TRADE_READ_OWN', category: 'TRADE' },
  { power_id: 'PWR_TRADE_READ_ALL', power_name: 'TRADE_READ_ALL', category: 'TRADE' },
  { power_id: 'PWR_TRADE_READ_SUBSCRIBED', power_name: 'TRADE_READ_SUBSCRIBED', category: 'TRADE' },
  { power_id: 'PWR_TRADE_DELETE', power_name: 'TRADE_DELETE', category: 'TRADE' },
  
  { power_id: 'PWR_ANALYST_ONBOARD', power_name: 'ANALYST_ONBOARD', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_VERIFY', power_name: 'ANALYST_VERIFY', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_PROFILE_EDIT_OWN', power_name: 'ANALYST_PROFILE_EDIT_OWN', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_PROFILE_EDIT_ALL', power_name: 'ANALYST_PROFILE_EDIT_ALL', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_READ_OWN', power_name: 'ANALYST_READ_OWN', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_READ_ALL', power_name: 'ANALYST_READ_ALL', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_BLOCK', power_name: 'ANALYST_BLOCK', category: 'ANALYST' },
  { power_id: 'PWR_ANALYST_PERFORMANCE_VIEW', power_name: 'ANALYST_PERFORMANCE_VIEW', category: 'ANALYST' },
  
  { power_id: 'PWR_USER_REGISTER', power_name: 'USER_REGISTER', category: 'USER' },
  { power_id: 'PWR_USER_PROFILE_EDIT_OWN', power_name: 'USER_PROFILE_EDIT_OWN', category: 'USER' },
  { power_id: 'PWR_USER_PROFILE_EDIT_ALL', power_name: 'USER_PROFILE_EDIT_ALL', category: 'USER' },
  { power_id: 'PWR_USER_READ_OWN', power_name: 'USER_READ_OWN', category: 'USER' },
  { power_id: 'PWR_USER_READ_ALL', power_name: 'USER_READ_ALL', category: 'USER' },
  { power_id: 'PWR_USER_BLOCK', power_name: 'USER_BLOCK', category: 'USER' },
  { power_id: 'PWR_USER_KYC_SUBMIT', power_name: 'USER_KYC_SUBMIT', category: 'USER' },
  { power_id: 'PWR_USER_KYC_VERIFY', power_name: 'USER_KYC_VERIFY', category: 'USER' },
  { power_id: 'PWR_USER_STATE_CHANGE', power_name: 'USER_STATE_CHANGE', category: 'USER' },
  
  { power_id: 'PWR_PLAN_CREATE', power_name: 'PLAN_CREATE', category: 'PLAN' },
  { power_id: 'PWR_PLAN_MODIFY_OWN', power_name: 'PLAN_MODIFY_OWN', category: 'PLAN' },
  { power_id: 'PWR_PLAN_MODIFY_ALL', power_name: 'PLAN_MODIFY_ALL', category: 'PLAN' },
  { power_id: 'PWR_PLAN_READ_OWN', power_name: 'PLAN_READ_OWN', category: 'PLAN' },
  { power_id: 'PWR_PLAN_READ_ALL', power_name: 'PLAN_READ_ALL', category: 'PLAN' },
  { power_id: 'PWR_PLAN_DELETE', power_name: 'PLAN_DELETE', category: 'PLAN' },
  { power_id: 'PWR_PLAN_ACTIVATE_DEACTIVATE', power_name: 'PLAN_ACTIVATE_DEACTIVATE', category: 'PLAN' },
  
  { power_id: 'PWR_SUBSCRIPTION_CREATE', power_name: 'SUBSCRIPTION_CREATE', category: 'SUBSCRIPTION' },
  { power_id: 'PWR_SUBSCRIPTION_CANCEL_OWN', power_name: 'SUBSCRIPTION_CANCEL_OWN', category: 'SUBSCRIPTION' },
  { power_id: 'PWR_SUBSCRIPTION_CANCEL_ALL', power_name: 'SUBSCRIPTION_CANCEL_ALL', category: 'SUBSCRIPTION' },
  { power_id: 'PWR_SUBSCRIPTION_READ_OWN', power_name: 'SUBSCRIPTION_READ_OWN', category: 'SUBSCRIPTION' },
  { power_id: 'PWR_SUBSCRIPTION_READ_ALL', power_name: 'SUBSCRIPTION_READ_ALL', category: 'SUBSCRIPTION' },
  { power_id: 'PWR_SUBSCRIPTION_REFUND', power_name: 'SUBSCRIPTION_REFUND', category: 'SUBSCRIPTION' },
  
  { power_id: 'PWR_NOTIFICATION_SEND_TARGETED', power_name: 'NOTIFICATION_SEND_TARGETED', category: 'NOTIFICATION' },
  { power_id: 'PWR_NOTIFICATION_SEND_BROADCAST', power_name: 'NOTIFICATION_SEND_BROADCAST', category: 'NOTIFICATION' },
  { power_id: 'PWR_NOTIFICATION_READ_OWN', power_name: 'NOTIFICATION_READ_OWN', category: 'NOTIFICATION' },
  { power_id: 'PWR_NOTIFICATION_MARK_READ', power_name: 'NOTIFICATION_MARK_READ', category: 'NOTIFICATION' },
  
  { power_id: 'PWR_ADMIN_DASHBOARD_VIEW', power_name: 'ADMIN_DASHBOARD_VIEW', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_ANALYTICS_VIEW', power_name: 'ADMIN_ANALYTICS_VIEW', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_LOGS_VIEW', power_name: 'ADMIN_LOGS_VIEW', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_LOGS_DELETE', power_name: 'ADMIN_LOGS_DELETE', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_ROLE_MANAGE', power_name: 'ADMIN_ROLE_MANAGE', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_POWER_MANAGE', power_name: 'ADMIN_POWER_MANAGE', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_USER_ROLE_ASSIGN', power_name: 'ADMIN_USER_ROLE_ASSIGN', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_SYSTEM_CONFIG', power_name: 'ADMIN_SYSTEM_CONFIG', category: 'ADMIN' },
  // ── Telegram broadcast governance ──────────────────────────────────────────
  // TELEGRAM_LIMIT: allows setting per-analyst daily broadcast caps via
  //   PATCH /admin/analysts/:analyst_id/telegram-limit
  // TELEGRAM_READ: allows auditing the 5-year SEBI retention log via
  //   GET /admin/telegram/messages (proxied to notification-service internal)
  { power_id: 'PWR_ADMIN_TELEGRAM_LIMIT', power_name: 'ADMIN_TELEGRAM_LIMIT', category: 'ADMIN' },
  { power_id: 'PWR_ADMIN_TELEGRAM_READ', power_name: 'ADMIN_TELEGRAM_READ', category: 'ADMIN' },
  // Marketing waitlist (landing-page email capture). Deliberately NOT folded
  // into USER_READ_ALL: a sales rep needs the lead list and nothing else, and
  // the user roster carries phone numbers, KYC state, and block controls.
  { power_id: 'PWR_WAITLIST_READ', power_name: 'WAITLIST_READ', category: 'ADMIN' },
  
  { power_id: 'PWR_SECURITY_LOGS_VIEW', power_name: 'SECURITY_LOGS_VIEW', category: 'SECURITY' },
  { power_id: 'PWR_SECURITY_THREAT_INVESTIGATE', power_name: 'SECURITY_THREAT_INVESTIGATE', category: 'SECURITY' },
  { power_id: 'PWR_SECURITY_IP_BLOCK', power_name: 'SECURITY_IP_BLOCK', category: 'SECURITY' },
  { power_id: 'PWR_SECURITY_DEVICE_REVOKE', power_name: 'SECURITY_DEVICE_REVOKE', category: 'SECURITY' },
  
  { power_id: 'PWR_MARKET_DATA_VIEW', power_name: 'MARKET_DATA_VIEW', category: 'MARKET_DATA' },
  { power_id: 'PWR_MARKET_DATA_MANAGE', power_name: 'MARKET_DATA_MANAGE', category: 'MARKET_DATA' },
  
  { power_id: 'PWR_WEBSOCKET_CONNECT', power_name: 'WEBSOCKET_CONNECT', category: 'WEBSOCKET' },
  { power_id: 'PWR_WEBSOCKET_SUBSCRIBE_TRADES', power_name: 'WEBSOCKET_SUBSCRIBE_TRADES', category: 'WEBSOCKET' },
  { power_id: 'PWR_WEBSOCKET_SUBSCRIBE_MARKET', power_name: 'WEBSOCKET_SUBSCRIBE_MARKET', category: 'WEBSOCKET' },

  // Approving a payout account decides where an analyst's money lands, and the
  // review exposes their bank proof document — deliberately its own power so it
  // can be granted to finance/compliance without handing over the whole console.
  { power_id: 'PWR_BANK_VERIFY', power_name: 'BANK_VERIFY', category: 'PAYOUT' },
];

export async function seedPowers() {
  const ops = POWERS.map((power) => ({
    updateOne: {
      filter: { power_id: power.power_id },
      update: { $set: { ...power, is_system_power: true } },
      upsert: true,
    },
  }));
  await Power.bulkWrite(ops);
  console.log(`Seeded ${POWERS.length} powers`);
}
