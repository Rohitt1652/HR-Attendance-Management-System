/**
 * Reset password for a specific employee
 * Usage: node reset-password.js <employeeId> <newPassword>
 * Example: node reset-password.js RM-124 Welcome@123
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const [,, empId, newPass] = process.argv;

if (!empId || !newPass) {
  console.log('Usage: node reset-password.js <employeeId> <newPassword>');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const user = await User.findOne({ employeeId: empId });
  if (!user) {
    console.log(`❌ Employee ${empId} not found`);
    process.exit(1);
  }
  const hash = await bcrypt.hash(newPass, 10);
  user.password = hash;
  await user.save();
  console.log(`✅ Password reset for ${user.name} (${empId}) → ${newPass}`);
  await mongoose.disconnect();
}).catch(console.error);
