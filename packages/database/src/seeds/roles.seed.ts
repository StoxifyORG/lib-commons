import { Power } from '../models/Power.model';
import { Role } from '../models/Role.model';

// Returns the role_ids of EXISTING roles whose power set changed, so the caller
// can invalidate the per-user RBAC powers cache only for affected users.
export async function seedRoles(): Promise<string[]> {
  const allPowers = await Power.find({}).lean();
  const powerMap = new Map<string, string>();
  for (const p of allPowers) {
    powerMap.set(p.power_name, p.power_id);
  }

  const getPowerIds = (names: string[]) => names.map(n => powerMap.get(n)).filter(Boolean) as string[];

  const roleDefinitions = [
    {
      role_name: 'END_USER',
      description: 'End User',
      powers: getPowerIds([
        'USER_REGISTER', 'USER_PROFILE_EDIT_OWN', 'USER_READ_OWN', 'USER_KYC_SUBMIT',
        'SUBSCRIPTION_CREATE', 'SUBSCRIPTION_CANCEL_OWN', 'SUBSCRIPTION_READ_OWN',
        'TRADE_READ_SUBSCRIBED', 'ANALYST_READ_ALL', 'ANALYST_PERFORMANCE_VIEW',
        'PLAN_READ_ALL', 'NOTIFICATION_READ_OWN', 'NOTIFICATION_MARK_READ',
        'WEBSOCKET_CONNECT', 'WEBSOCKET_SUBSCRIBE_TRADES', 'WEBSOCKET_SUBSCRIBE_MARKET',
        'MARKET_DATA_VIEW'
      ])
    },
    {
      role_name: 'ANALYST',
      description: 'Analyst',
      powers: getPowerIds([
        'ANALYST_ONBOARD', 'ANALYST_PROFILE_EDIT_OWN', 'ANALYST_READ_OWN', 'ANALYST_READ_ALL',
        'TRADE_CREATE', 'TRADE_MODIFY', 'TRADE_CLOSE', 'TRADE_READ_OWN',
        'PLAN_CREATE', 'PLAN_MODIFY_OWN', 'PLAN_READ_OWN', 'PLAN_READ_ALL', 'PLAN_ACTIVATE_DEACTIVATE',
        'SUBSCRIPTION_READ_OWN',
        'NOTIFICATION_READ_OWN', 'NOTIFICATION_MARK_READ', 'WEBSOCKET_CONNECT',
        'WEBSOCKET_SUBSCRIBE_MARKET', 'MARKET_DATA_VIEW', 'USER_READ_OWN'
      ])
    },
    // ADMIN_DASHBOARD_VIEW is what lets an internal account open the admin
    // console at all (the session check in the admin app requires it). Every
    // console-facing internal role below needs it or the holder can sign in but
    // lands on "no admin dashboard access".
    {
      role_name: 'ANALYST_REVIEWER',
      description: 'Reviews analyst applications and approves them to ACTIVE',
      powers: getPowerIds([
        'ADMIN_DASHBOARD_VIEW',
        'ANALYST_VERIFY', 'ANALYST_READ_ALL', 'ANALYST_PROFILE_EDIT_ALL',
        'USER_READ_ALL', 'ADMIN_LOGS_VIEW'
      ])
    },
    {
      role_name: 'SUPPORT',
      description: 'Support',
      powers: getPowerIds([
        'ADMIN_DASHBOARD_VIEW',
        'USER_READ_ALL', 'USER_PROFILE_EDIT_ALL', 'ANALYST_READ_ALL',
        'SUBSCRIPTION_CANCEL_ALL', 'SUBSCRIPTION_READ_ALL', 'SUBSCRIPTION_REFUND',
        'SECURITY_DEVICE_REVOKE', 'NOTIFICATION_READ_OWN'
      ])
    },
    // Sales reps working the landing-page waitlist. Intentionally the smallest
    // console role we have: the lead list and nothing else. No USER_READ_ALL —
    // they must not be able to browse the trader roster, phone numbers, or KYC.
    {
      role_name: 'SALES',
      description: 'Views the marketing waitlist and reaches out to leads',
      powers: getPowerIds([
        'ADMIN_DASHBOARD_VIEW',
        'WAITLIST_READ'
      ])
    },
    {
      role_name: 'DEVELOPER',
      description: 'Developer',
      powers: getPowerIds([
        'ADMIN_DASHBOARD_VIEW',
        'ADMIN_LOGS_VIEW', 'ADMIN_SYSTEM_CONFIG', 'SECURITY_LOGS_VIEW',
        'SECURITY_IP_BLOCK', 'MARKET_DATA_MANAGE'
      ])
    },
    {
      role_name: 'ADMIN',
      description: 'Administrator',
      powers: getPowerIds([
        'TRADE_READ_ALL', 'ANALYST_VERIFY', 'ANALYST_PROFILE_EDIT_ALL', 'ANALYST_BLOCK',
        'ANALYST_READ_ALL', 'USER_PROFILE_EDIT_ALL', 'USER_READ_ALL', 'USER_BLOCK',
        'USER_STATE_CHANGE', 'PLAN_MODIFY_ALL', 'PLAN_READ_ALL', 'SUBSCRIPTION_CANCEL_ALL',
        'SUBSCRIPTION_READ_ALL', 'SUBSCRIPTION_REFUND', 'NOTIFICATION_SEND_BROADCAST',
        'ADMIN_DASHBOARD_VIEW', 'ADMIN_ANALYTICS_VIEW', 'ADMIN_LOGS_VIEW',
        'ADMIN_USER_ROLE_ASSIGN', 'SECURITY_LOGS_VIEW', 'SECURITY_THREAT_INVESTIGATE',
        'SECURITY_DEVICE_REVOKE',
        // Telegram broadcast governance (SEBI audit + per-analyst rate cap)
        'ADMIN_TELEGRAM_LIMIT', 'ADMIN_TELEGRAM_READ',
        // Payout account verification (review queue + proof document access)
        'BANK_VERIFY',
        // Marketing waitlist lead list
        'WAITLIST_READ'
      ])
    },
    {
      role_name: 'FOUNDER',
      description: 'Founder',
      powers: Array.from(powerMap.values()) // all powers
    }
  ];

  const enriched = roleDefinitions.map((role) => ({
    ...role,
    role_id: 'ROLE_' + role.role_name.toLowerCase(),
    is_system_role: true,
  }));

  // Compare incoming power sets against what's already stored so we know which
  // roles actually changed. Brand-new roles are skipped — no user holds them yet,
  // so there is nothing cached to invalidate.
  const existing = await Role.find(
    { role_id: { $in: enriched.map((r) => r.role_id) } },
    { role_id: 1, powers: 1 },
  ).lean();
  const existingPowers = new Map<string, Set<string>>(
    existing.map((r) => [r.role_id as string, new Set((r.powers ?? []) as string[])]),
  );

  const changedRoleIds: string[] = [];
  for (const role of enriched) {
    const prev = existingPowers.get(role.role_id);
    if (!prev) continue; // new role — nothing cached for it
    const next = new Set(role.powers);
    const differs = prev.size !== next.size || [...next].some((p) => !prev.has(p));
    if (differs) changedRoleIds.push(role.role_id);
  }

  const ops = enriched.map((role) => ({
    updateOne: {
      filter: { role_name: role.role_name },
      update: { $set: role },
      upsert: true,
    },
  }));

  await Role.bulkWrite(ops as Parameters<typeof Role.bulkWrite>[0]);
  console.log(
    `Seeded ${roleDefinitions.length} roles (${changedRoleIds.length} with changed power sets)`,
  );

  return changedRoleIds;
}
