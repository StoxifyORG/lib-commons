export const RedisKeys = {
  // Sessions
  session: (sessionId: string) => `session:${sessionId}`,
  tokenBlacklist: (tokenHash: string) => `token_blacklist:${tokenHash}`,
  tokenFamilyBlacklist: (tokenFamily: string) => `token_family_blacklist:${tokenFamily}`,

  // Nonces
  nonce: (deviceId: string, nonce: string, date: string) =>
    `nonce:${deviceId}:${nonce}:${date}`,

  // RBAC
  userPowers: (userId: string) => `RBAC:user:${userId}:powers`,
  userRoles: (userId: string) => `RBAC:user:${userId}:roles`,
  userState: (userId: string) => `RBAC:user:${userId}:state`,
  rolePowers: (roleId: string) => `RBAC:role:${roleId}:powers`,

  // WebSocket
  wsChannel: (channelId: string) => `ws_channel:${channelId}`,
  wsConnection: (userId: string) => `ws_connection:${userId}`,
  wsSubsAnalyst: (analystId: string) => `ws_subs:analyst:${analystId}`,
  wsSubsMarket: (symbol: string) => `ws_subs:market:${symbol}`,

  // Market data
  price: (symbol: string, segment: string) => `price:${symbol}:${segment}`,
  activeInstruments: () => 'active_instruments',
  activeTrades: (symbol: string) => `active_trades:${symbol}`,
  trade: (tradeId: string) => `trade:${tradeId}`,
  marketPricesHash: () => 'market:prices',
  marketPricesTimestampHash: () => 'market:prices_timestamps',
  marketQuotesHash: () => 'market:quotes', // Full quote data (netChange, percentChange, etc.)

  // Rate limiting
  rateLimitUser: (userId: string, minute: string) =>
    `rate_limit:user:${userId}:minute:${minute}`,
  rateLimitDevice: (deviceId: string, minute: string) =>
    `rate_limit:device:${deviceId}:minute:${minute}`,
  rateLimitIp: (ip: string, minute: string) =>
    `rate_limit:ip:${ip}:minute:${minute}`,
  rateLimitStrike: (userId: string) => `rate_limit:strikes:${userId}`,

  // OTP
  otpEmail: (email: string) => `otp:email:${email}`,
  otpPhone: (phone: string) => `otp:phone:${phone}`,
  otpAttemptEmail: (email: string) => `otp:attempt:email:${email}`,
  otpAttemptPhone: (phone: string) => `otp:attempt:phone:${phone}`,
  otpRateEmail: (email: string) => `otp:rate:email:${email}`,
  otpRatePhone: (phone: string) => `otp:rate:phone:${phone}`,

  // Account-deletion OTP — separate namespace so a delete OTP never collides
  // with a concurrent login OTP on the same phone.
  otpDeletePhone: (phone: string) => `otp:delete:phone:${phone}`,
  otpAttemptDeletePhone: (phone: string) => `otp:attempt:delete:phone:${phone}`,

  // Registration bridge token (single-use; consumed at onboarding)
  registrationToken: (jti: string) => `registration_token:${jti}`,

  // ECDSA key cache
  ecdsaPublicKey: (keyVersion: string) => `ecdsa_public_key:${keyVersion}`,

  // IP block cache (set of blocked IPs, 60s TTL)
  ipBlockSet: () => 'ip_blocks:active',
};
