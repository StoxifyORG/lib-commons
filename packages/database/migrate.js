const mongoose = require('mongoose');
const { Subscription } = require('./dist/models/Subscription.model.js');
const { Plan } = require('./dist/models/Plan.model.js');

async function migrate() {
  await mongoose.connect('mongodb://localhost:27017/stoxify');
  console.log('Connected to db');

  // get all subscriptions missing plan_name
  const subs = await Subscription.find({ plan_name: { $exists: false } });
  console.log(`Found ${subs.length} subs to migrate`);

  for (const sub of subs) {
    const plan = await Plan.findOne({ plan_id: sub.plan_id });
    if (plan) {
      sub.plan_name = plan.name;
      // Note: plan is the Batch, so plan.name is the Batch name (e.g. Momentum Swing)
      // sub.plan_id is actually the Batch ID in the old schema.
      // Wait, let's check what Plan model looks like.
      
      // If the UI expects batch_name to be the tier and plan_name to be the Batch?
      // Actually, TraderProfile shows: sub.plan_name • sub.batch_name
      // So plan_name should be the main Batch (Momentum Swing)
      // batch_name should be the tier (Monthly Tier)

      // Find the specific tier (batch) inside the plan
      const tier = plan.batches.find(b => b.batch_id === sub.batch_id);
      if (tier) {
        sub.batch_name = tier.name;
      }
      
      console.log(`Migrating ${sub._id}: ${sub.plan_name} • ${sub.batch_name}`);
      await sub.save();
    } else {
      console.log(`Plan not found for sub ${sub._id} with plan_id ${sub.plan_id}`);
      // As a fallback, try to set some name if we can't find it, or leave it.
      // Let's hardcode for PLAN_3SnLz5wt if it's not found in DB
      if (sub.plan_id === 'PLAN_3SnLz5wt') {
        sub.plan_name = 'Momentum Swing';
        sub.batch_name = 'Monthly';
        console.log(`Hardcoding name for ${sub.plan_id}`);
        await sub.save();
      }
    }
  }

  // Also check if any subs have plan_name but no batch_name? 
  // Let's just update all subs where plan_id is PLAN_3SnLz5wt
  const hardcodedSubs = await Subscription.find({ plan_id: 'PLAN_3SnLz5wt' });
  for (const sub of hardcodedSubs) {
    if (!sub.plan_name || sub.plan_name === 'PLAN_3SnLz5wt') {
      sub.plan_name = 'Momentum Swing';
      sub.batch_name = 'Monthly Tier';
      await sub.save();
      console.log(`Updated PLAN_3SnLz5wt to Momentum Swing`);
    }
  }
  
  // also check PLAN_sCZUbJZn
  const sub2 = await Subscription.find({ plan_id: 'PLAN_sCZUbJZn' });
  for (const sub of sub2) {
    if (!sub.plan_name || sub.plan_name === 'PLAN_sCZUbJZn') {
      sub.plan_name = 'Test Batch';
      sub.batch_name = 'Yearly Tier';
      await sub.save();
      console.log(`Updated PLAN_sCZUbJZn to Test Batch`);
    }
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
