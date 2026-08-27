const mongoose = require('mongoose');

const uri = 'mongodb+srv://StoxifyUser:Stoxify@stoxifycluster0.tiri2s9.mongodb.net/stoxify?appName=StoxifyCluster0';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const Plan = mongoose.model('Plan', new mongoose.Schema({}, { strict: false }));
  
  const planRes = await Plan.deleteMany({});
  console.log(`Deleted ${planRes.deletedCount} plans.`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(console.error);
