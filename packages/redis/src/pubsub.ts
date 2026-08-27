// Redis Pub/Sub channel names
export const PubSubChannels = {
  TRADE_EVENTS: 'events:trade',
  MARKET_EVENTS: 'events:market',
  TRADE_CLOSURE: 'trade_closure',
  SUBSCRIPTION_EVENTS: 'events:subscription',
} as const;

export type PubSubChannel = typeof PubSubChannels[keyof typeof PubSubChannels];
