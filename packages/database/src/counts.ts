import mongoose from 'mongoose';
import { connectDatabase } from './connection';
import { Power, Role, User } from './index';

async function runCounts() {
  await connectDatabase({
    options: { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 },
  });

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
