const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/stoxify').then(async () => {
  const db = mongoose.connection.db;
  const missingPlanTrades = await db.collection('trades').find({ plan_id: { $exists: false } }).sort({_id:-1}).limit(2).toArray();
  console.log(JSON.stringify(missingPlanTrades, null, 2));
  process.exit(0);
});
