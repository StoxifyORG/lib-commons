import mongoose, { Schema } from 'mongoose';

const MarketDataCacheSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true },
    last_traded_price: { type: Number, required: true },
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    volume: Number,
    last_updated: { type: Date, required: true },
    exchange: String,
    segment: String,
  }
);

MarketDataCacheSchema.index({ last_updated: 1 });

export const MarketDataCache = mongoose.model('MarketDataCache', MarketDataCacheSchema);
