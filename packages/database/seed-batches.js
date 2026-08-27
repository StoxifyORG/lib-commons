const mongoose = require('mongoose');

const uri = 'mongodb+srv://StoxifyUser:Stoxify@stoxifyorgcluster0.tiri2s9.mongodb.net/stoxify?appName=StoxifyCluster0';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const Plan = mongoose.model('Plan', new mongoose.Schema({}, { strict: false }));

  // Update Alpha Pro Course
  await Plan.updateOne(
    { plan_id: 'PLAN_vzcxvRsv' },
    {
      $set: {
        batches: [
          {
            batch_id: 'batch_fno_1',
            name: 'fno',
            price: 15000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          },
          {
            batch_id: 'batch_equity_1',
            name: 'equity',
            price: 8000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          },
          {
            batch_id: 'batch_swing_1',
            name: 'swing',
            price: 6000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          }
        ]
      }
    }
  );
  console.log('Updated PLAN_vzcxvRsv batches to real objects');

  // Update Main
  await Plan.updateOne(
    { plan_id: 'PLAN_AESJcQGp' },
    {
      $set: {
        batches: [
          {
            batch_id: 'batch_fno_2',
            name: 'fno',
            price: 10000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          },
          {
            batch_id: 'batch_equity_2',
            name: 'equity',
            price: 5000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          }
        ]
      }
    }
  );
  console.log('Updated PLAN_AESJcQGp batches');

  // Update New Main
  await Plan.updateOne(
    { plan_id: 'PLAN_K9urHIM7' },
    {
      $set: {
        batches: [
          {
            batch_id: 'batch_swing_3',
            name: 'swing',
            price: 7000,
            days: 30,
            billing_cycle: 'MONTH',
            is_active: true
          }
        ]
      }
    }
  );
  console.log('Updated PLAN_K9urHIM7 batches');

  await mongoose.disconnect();
  console.log('Disconnected');
}

main().catch(console.error);
