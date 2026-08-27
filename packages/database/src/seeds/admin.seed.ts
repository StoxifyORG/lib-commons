import { User, InternalTeamUser } from '../models/User.model';
import { UserRole } from '../models/UserRole.model';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';

export async function seedAdmin() {
  const email = process.env.SEED_FOUNDER_EMAIL || 'founder@stoxifyorg.com';
  const existingFounder = await InternalTeamUser.findOne({ $or: [{ email }, { phone: '+910000000000' }] });
  if (existingFounder) {
    console.log('Founder already exists, skipping...');
    return;
  }

  const password = process.env.SEED_FOUNDER_PASSWORD || 'Secret@1234';
  const password_hash = await bcrypt.hash(password, 12);
  const user_id = 'INTERNAL_' + nanoid(10);

  const founder = new InternalTeamUser({
    user_id,
    name: 'Founder',
    email,
    phone: '+910000000000',
    state: 'ACTIVE',
    password_hash,
    assigned_role: 'FOUNDER',
    mfa_enabled: false,
  });

  await founder.save();

  await UserRole.create({
    user_id,
    role_id: 'ROLE_founder',
    assigned_at: new Date(),
    assigned_by: 'SYSTEM',
    is_active: true,
  });

  console.log('Founder created successfully');
}
