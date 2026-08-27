import { connectDatabase } from '../src/connection';
import mongoose from 'mongoose';

// Since we're writing this file in packages/database, the relative path to connection is likely './connection'
// Wait, I will just write it in packages/database/src/counts.ts
import { connectDatabase as connectDb } from './connection';
import { Power, Role, User } from './index';

async function runCounts() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/stoxify';
  await connectDb(uri);
  
  try {
    const powersCount = await Power.countDocuments();
    const rolesCount = await Role.countDocuments();
    const founderCount = await User.countDocuments({ user_type: 'INTERNAL_TEAM' });

    console.log('Powers:', powersCount);
    console.log('Roles:', rolesCount);
    console.log('Founder:', founderCount);
  } catch (error) {
    console.error('Count failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

runCounts();
