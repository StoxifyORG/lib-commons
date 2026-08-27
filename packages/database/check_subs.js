const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/stoxify').then(async () => {
  const db = mongoose.connection.db;
  const subs = await db.collection('subscriptions').find({ status: 'ACTIVE' }).limit(3).toArray();
  console.log(JSON.stringify(subs, null, 2));
  process.exit(0);
});
