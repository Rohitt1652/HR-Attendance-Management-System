/**
 * Migration: Mark Compensatory Off and Loss of Pay as "free hand" leave types.
 * Free-hand leaves have no quota — unlimited applications, admin approves ad-hoc.
 *
 * Run: node scripts/set-freehand-leaves.js
 * Safe to run multiple times (idempotent).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const LeaveType = mongoose.connection.collection('leavetypes');

  // Codes to mark as free-hand (no quota enforcement)
  const freeHandCodes = ['COMP', 'LOP'];

  for (const code of freeHandCodes) {
    const result = await LeaveType.updateOne(
      { code },
      { $set: { isFreeHand: true } }
    );
    if (result.matchedCount > 0) {
      console.log(`✓ ${code} → isFreeHand: true (${result.modifiedCount ? 'updated' : 'already set'})`);
    } else {
      console.log(`⚠ ${code} not found in leavetypes collection`);
    }
  }

  console.log('\nDone. Free-hand leaves will show as unlimited (∞) in the dropdown.');
  console.log('No quota checks will be enforced — approval is manual by admin.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
