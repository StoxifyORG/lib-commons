const mongoose = require('mongoose');

const uri = 'mongodb+srv://StoxifyUser:Stoxify@stoxifyorgcluster0.tiri2s9.mongodb.net/stoxify?appName=StoxifyCluster0';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const Plan = mongoose.model('Plan', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

  const plans = await Plan.find().lean();
  console.log('\n--- PLANS ---');
  plans.forEach(p => {
    console.log(`Plan ID: ${p.plan_id}, Name: ${p.name}, Analyst ID: ${p.analyst_id}, Analyst Name: ${p.analyst_name}`);
  });

  const users = await User.find().lean();
  console.log('\n--- USERS ---');
  users.forEach(u => {
    console.log(`User ID: ${u.user_id}, Name: ${u.name}, Email: ${u.email}, User Type: ${u.user_type}, State: ${u.state}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
