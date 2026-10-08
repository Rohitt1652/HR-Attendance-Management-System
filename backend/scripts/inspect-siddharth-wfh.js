require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Attendance = require('../src/models/Attendance');
const Leave = require('../src/models/Leave');
(async () => {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Using MONGO_URI:', uri ? uri.slice(0, 60) + '...' : 'missing');
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const user = await User.findOne({ employeeId: 'MAS-288' }).lean();
    console.log('user', user ? { _id: String(user._id), employeeId: user.employeeId, name: user.name } : 'missing');
    if (!user) return process.exit(0);
    const atts = await Attendance.find({ employeeId: user._id, workMode: 'wfh', date: { $gte: '2026-08-01', $lte: '2026-08-31' } }).sort({ date: 1 }).lean();
    console.log('attendance count', atts.length);
    console.log('attendance dates', atts.map(a => a.date));
    const leaves = await Leave.find({ employeeId: user._id, status: { $in: ['Approved', 'Pending'] }, startDate: { $gte: new Date('2026-08-01'), $lte: new Date('2026-08-31') } }).lean();
    console.log('leave count', leaves.length);
    console.log('leave rows', leaves.map(l => ({ code: l.leaveTypeCode, totalDays: l.totalDays, startDate: l.startDate?.toISOString().slice(0,10), endDate: l.endDate?.toISOString().slice(0,10) })));
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
