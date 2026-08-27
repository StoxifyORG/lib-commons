import mongoose, { Schema } from 'mongoose';

const SettlementLogSchema = new Schema(
  {
    raId: { type: String, required: true },
    subscriptionId: { type: String, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    amountSettled: { type: Number, required: true },
    daysSettled: { type: Number, required: true },
    dailyEarnRate: { type: Number, required: true },
    settlementDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SettlementLogSchema.index({ raId: 1, settlementDate: -1 });
SettlementLogSchema.index({ subscriptionId: 1 });

export const SettlementLog = mongoose.model('SettlementLog', SettlementLogSchema);
