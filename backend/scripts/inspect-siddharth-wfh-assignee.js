require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Attendance = require('../src/models/Attendance');
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const assignedById = '69cfb55d57e03ae02432a23b';
    const userId = '69cfbb67641a5aa9e2bed28c';
    const assignee = await User.findById(assignedById).lean();
    console.log('assignedBy', assignee ? { _id: String(assignee._id), employeeId: assignee.employeeId, name: assignee.name, role: assignee.role } : 'missing');
    const records = await Attendance.find({ employeeId: userId, date: { $gte: '2026-08-01', $lte: '2026-08-31' } }).sort({ date: 1 }).lean();
    console.log('count', records.length);
    const reasons = {};
    records.forEach(r => {
      reasons[r.wfhReason] = (reasons[r.wfhReason] || 0) + 1;
    });
    console.log('reasons', reasons);
    console.log('first record', records[0] ? { date: records[0].date, source: records[0].source, wfhAssignedBy: String(records[0].wfhAssignedBy), wfhReason: records[0].wfhReason } : null);
    console.log('last record', records[records.length - 1] ? { date: records[records.length - 1].date, source: records[records.length - 1].source, wfhAssignedBy: String(records[records.length - 1].wfhAssignedBy), wfhReason: records[records.length - 1].wfhReason } : null);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
