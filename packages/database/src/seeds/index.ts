import { connectDatabase } from '../connection';
import { seedPowers } from './powers.seed';
import { seedRoles } from './roles.seed';
import { seedAdmin } from './admin.seed';
import mongoose from 'mongoose';

// Idempotent — safe to call on every startup (no disconnect).
// Returns the role_ids whose power set changed so the caller can invalidate the
// affected users' RBAC powers cache (which would otherwise stay stale for ~1h).
export async function runSeed(): Promise<{ changedRoleIds: string[] }> {
  await seedPowers();
  const changedRoleIds = await seedRoles();
  await seedAdmin();
  return { changedRoleIds };
}

async function runSeeds() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/stoxify';
  await connectDatabase(uri);

  try {
    await runSeed();
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  runSeeds();
}
