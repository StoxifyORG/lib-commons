import mongoose, { Schema } from 'mongoose';

const RABalanceSchema = new Schema(
  {
    raId: { type: String, required: true, unique: true },
    withdrawableBalance: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);


export const RABalance = mongoose.model('RABalance', RABalanceSchema);
