require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { getAttendanceWithWfh } = require('../src/controllers/reportController');
(async () => {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const start = '2026-08-01';
    const end = '2026-08-31';
    const records = await getAttendanceWithWfh({ date: { $gte: start, $lte: end } }, start, end);
    console.log('monthly report count', records.length);
    const byEmp = records.reduce((map, rec) => {
      const id = String(rec.employeeId?._id || rec.employeeId);
      map[id] = (map[id] || 0) + 1;
      return map;
    }, {});
    const user = await User.findOne({ employeeId: 'MAS-288' }).lean();
    console.log('MAS-288 count', user ? byEmp[String(user._id)] || 0 : 'user missing');
    console.log('sample last 10 records', records.slice(0, 10).map(r => ({ date: r.date, emp: r.employeeId?.employeeId || r.employeeId, workMode: r.workMode, timeStatus: r.timeStatus })));
    await mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
