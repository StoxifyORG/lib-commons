export interface TradeCreatedEvent {
  event_type: 'trade.created';
  trade_id: string;
  analyst_id: string;
  analyst_name: string;
  symbol?: string;        // SIMPLE trade
  leg1_symbol?: string;   // PAIR trade
  leg2_symbol?: string;   // PAIR trade
  direction?: string;
  entry_price: number;
  stop_loss: number;
  target: number;
  timestamp: number;
}

export interface TradeModifiedEvent {
  event_type: 'trade.modified';
  trade_id: string;
  analyst_id: string;
  modified_fields: Record<string, { old: unknown; new: unknown }>;
  modification_reason: string;
  timestamp: number;
}

export interface TradeClosedEvent {
  event_type: 'trade.closed';
  trade_id: string;
  analyst_id: string;
  status: 'CLOSED_BY_SL' | 'CLOSED_BY_TARGET' | 'MANUALLY_CLOSED';
  exit_price: number;
  pnl_percent: number;
  timestamp: number;
}

export interface TradeClosureQueueMessage {
  trade_id: string;
  symbol: string;
  closure_type: 'CLOSED_BY_SL' | 'CLOSED_BY_TARGET';
  exit_price: number;
  timestamp: number;
}

export interface PriceUpdateEvent {
  event_type: 'price.update';
  updates: Array<{
    symbol: string;
    ltp: number;
    change_percent: number;
    volume: number;
  }>;
  timestamp: number;
}

export interface SubscriptionExpiringEvent {
  event_type: 'subscription.expiring';
  subscription_id: string;
  user_id: string;
  analyst_id: string;
  plan_name: string;
  days_remaining: number;
}

export interface SubscriptionExpiredEvent {
  event_type: 'subscription.expired';
  subscription_id: string;
  user_id: string;
  analyst_id: string;
}

export type TradeEvent = TradeCreatedEvent | TradeModifiedEvent | TradeClosedEvent;
export type SubscriptionEvent = SubscriptionExpiringEvent | SubscriptionExpiredEvent;
