require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Attendance = require('../src/models/Attendance');
(async () => {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const user = await User.findOne({ employeeId: 'MAS-288' }).lean();
    console.log('user', user ? { _id: String(user._id), employeeId: user.employeeId, name: user.name } : 'missing');
    if (!user) return process.exit(0);
    const records = await Attendance.find({ employeeId: user._id, date: { $gte: '2026-08-01', $lte: '2026-08-31' } }).sort({ date: 1 }).lean();
    console.log('count', records.length);
    const sources = {};
    const assigned = {};
    records.forEach(r => {
      sources[r.source] = (sources[r.source] || 0) + 1;
      const aid = String(r.wfhAssignedBy || 'none');
      assigned[aid] = (assigned[aid] || 0) + 1;
    });
    console.log('sources', sources);
    console.log('assigned count', assigned);
    records.forEach(r => {
      console.log(r.date, r.status, r.workMode, r.source, String(r.wfhAssignedBy || ''), r.wfhReason || '');
    });
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
