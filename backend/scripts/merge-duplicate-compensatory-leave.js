/**
 * Merge duplicate Compensatory Leave records into Compensatory Off.
 *
 * The old MySQL export has one compensatory leave type:
 *   hrm_leavetype.Id=6, Code=compensatoryoff, Shortcode=C.Off
 * The old attendance table also has a CPL column for compensatory usage.
 *
 * Current canonical Mongo leave type:
 *   code: COMP, name: Compensatory Off
 *
 * This script maps duplicate CPS/CPL records to COMP and deactivates duplicate
 * leave type rows named "Compensatory Leave".
 *
 * Run: node scripts/merge-duplicate-compensatory-leave.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';
const DUPLICATE_CODES = ['CPS', 'CPL'];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const LeaveType = mongoose.connection.collection('leavetypes');
  const Leave = mongoose.connection.collection('leaves');
  const LeaveAllocation = mongoose.connection.collection('leaveallocations');

  await LeaveType.updateOne(
    { code: 'COMP' },
    {
      $set: {
        name: 'Compensatory Off',
        code: 'COMP',
        isActive: true,
        isFreeHand: true,
        maxDaysPerYear: null,
      },
      $setOnInsert: {
        color: '#14b8a6',
        allowHourly: false,
        allowHalfDay: true,
        requiresApproval: true,
        visibleToRoles: [],
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  const leaveResult = await Leave.updateMany(
    { leaveTypeCode: { $in: DUPLICATE_CODES } },
    { $set: { leaveTypeCode: 'COMP', leaveType: 'Compensatory Off' } }
  );
  console.log(`Mapped ${leaveResult.modifiedCount} leave record(s) from CPS/CPL to COMP.`);

  const allocationResult = await LeaveAllocation.deleteMany({ leaveTypeCode: { $in: DUPLICATE_CODES } });
  console.log(`Removed ${allocationResult.deletedCount} duplicate CPS/CPL allocation record(s).`);

  const typeResult = await LeaveType.updateMany(
    {
      $or: [
        { code: { $in: DUPLICATE_CODES } },
        { name: /^Compensatory Leave$/i },
      ],
    },
    { $set: { isActive: false } }
  );
  console.log(`Deactivated ${typeResult.modifiedCount} duplicate compensatory leave type row(s).`);

  console.log('Done. Use COMP / Compensatory Off as the single compensatory leave type.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
