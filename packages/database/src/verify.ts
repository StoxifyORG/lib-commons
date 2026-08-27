import mongoose from 'mongoose';
import { Power } from './models/Power.model';
import { Role } from './models/Role.model';
import { User } from './models/User.model';

async function verify() {
  await mongoose.connect('mongodb://localhost:27017/stoxify');
  console.log('=== VERIFICATION ===');
  console.log('Powers:', await Power.countDocuments());
  console.log('Roles:', await Role.countDocuments());
  console.log('Founder:', await User.countDocuments({ user_type: 'INTERNAL_TEAM', assigned_role: 'FOUNDER' }));
  
  const founderRole = await Role.findOne({ role_name: 'FOUNDER' }).lean() as any;
  console.log('FOUNDER role powers count:', founderRole?.powers?.length);
  console.log('');
  console.log('=== SAMPLE POWERS ===');
  
  const samplePowers = await Power.find({}, { power_id: 1, category: 1, _id: 0 }).limit(5).lean();
  samplePowers.forEach(p => console.log(JSON.stringify(p)));
  
  await mongoose.disconnect();
}

verify().catch(console.error);
