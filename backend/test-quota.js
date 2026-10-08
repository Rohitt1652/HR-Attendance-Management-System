require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Leave = require('./src/models/Leave');
  const User = require('./src/models/User');
  
  const user = await User.findOne({ employeeId: 'DT-439' });
  console.log('User:', user.name, '| Role:', user.role);
  
  const year = 2026;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  
  const leaves = await Leave.find({
    employeeId: user._id,
    leaveTypeCode: 'CL',
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $gte: yearStart, $lte: yearEnd }
  });
  
  const usedDays = leaves.reduce((s, l) => s + (l.totalDays || 0), 0);
  console.log('\nCL leaves (Pending+Approved) in 2026:', leaves.length, '| Total days:', usedDays);
  leaves.forEach(l => console.log(' -', l.status, l.totalDays + 'd', new Date(l.startDate).toLocaleDateString()));
  
  const alloc = await mongoose.connection.collection('leaveallocations').findOne({ role: user.role, leaveTypeCode: 'CL' });
  console.log('\nCL Allocation:', alloc?.daysAllowed + 'd');
  console.log('Remaining:', (alloc?.daysAllowed || 0) - usedDays + 'd');
  
  // Now simulate applying for 3 more days — should fail if remaining < 3
  const remaining = (alloc?.daysAllowed || 0) - usedDays;
  const requestedDays = 3;
  if (usedDays + requestedDays > alloc?.daysAllowed) {
    console.log('\n❌ BLOCKED: Cannot apply for', requestedDays + 'd. Only', remaining + 'd remaining.');
  } else {
    console.log('\n✅ ALLOWED: Can apply for', requestedDays + 'd. Remaining after:', remaining - requestedDays + 'd');
  }
  
  mongoose.disconnect();
}).catch(e => console.error(e.message));
