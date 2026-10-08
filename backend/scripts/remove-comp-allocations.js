/**
 * Remove COMP allocation records from all roles.
 * Free Hand on the LeaveType makes these redundant.
 * Run: node scripts/remove-comp-allocations.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  const result = await mongoose.connection.collection('leaveallocations').deleteMany({ leaveTypeCode: 'COMP' });
  console.log(`Removed ${result.deletedCount} COMP allocation records.`);
  console.log('COMP is now fully controlled by isFreeHand on the LeaveType.');
  await mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
