/**
 * Department cleanup script.
 * 
 * Usage:
 *   node scripts/cleanup-departments.js --dry-run   (preview only)
 *   node scripts/cleanup-departments.js             (live run)
 * 
 * Actions:
 *   1. Deactivate: SMO Team, Iphone Development
 *   2. Move active users from "Frontend Designer" → "Web Development"
 *   3. Deactivate: Frontend Designer (after move)
 * 
 * Safety:
 *   - No departments deleted (only status → inactive)
 *   - No inactive users modified
 *   - Settings.departments untouched
 *   - Leave records untouched
 *   - Permissions untouched
 *   - Idempotent
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../src/models/Department');
const User = require('../src/models/User');

const DRY_RUN = process.argv.includes('--dry-run');

const DEACTIVATE = ['SMO Team', 'Iphone Development'];
const MOVE_FROM = 'Frontend Designer';
const MOVE_TO = 'Web Development';

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '*** DRY RUN — no changes will be made ***\n' : '\n');

  // ── Step 1: Deactivate departments ──
  console.log('═══ Step 1: Deactivate Departments ═══');
  for (const name of DEACTIVATE) {
    const dept = await Department.findOne({ name });
    if (!dept) {
      console.log(`  ⚠ "${name}" not found in Department collection — skipping`);
      continue;
    }
    if (dept.status === 'inactive') {
      console.log(`  ✓ "${name}" already inactive — no change needed`);
      continue;
    }
    console.log(`  → "${name}" (currently: ${dept.status}) → will set inactive`);
    if (!DRY_RUN) {
      dept.status = 'inactive';
      dept.updatedAt = new Date();
      await dept.save();
      console.log(`    ✓ Done`);
    }
  }

  // ── Step 2: Move active users ──
  console.log('\n═══ Step 2: Move Active Users ═══');
  console.log(`  From: "${MOVE_FROM}"`);
  console.log(`  To:   "${MOVE_TO}"`);

  const usersToMove = await User.find({ department: MOVE_FROM, status: 'Active' }).select('name email employeeId department').lean();
  console.log(`\n  Active users to move: ${usersToMove.length}`);
  usersToMove.forEach(u => console.log(`    • ${u.name} (${u.employeeId}) — ${u.email}`));

  const alreadyMoved = await User.find({ department: MOVE_TO, status: 'Active', employeeId: { $in: usersToMove.map(u => u.employeeId) } }).lean();
  if (alreadyMoved.length > 0) {
    console.log(`\n  ⚠ ${alreadyMoved.length} user(s) already in "${MOVE_TO}" — idempotent check passed`);
  }

  if (usersToMove.length > 0 && !DRY_RUN) {
    const result = await User.updateMany(
      { department: MOVE_FROM, status: 'Active' },
      { department: MOVE_TO }
    );
    console.log(`\n    ✓ Moved ${result.modifiedCount} user(s) to "${MOVE_TO}"`);
  }

  // ── Step 3: Deactivate "Frontend Designer" ──
  console.log('\n═══ Step 3: Deactivate "Frontend Designer" ═══');
  const fdDept = await Department.findOne({ name: MOVE_FROM });
  if (!fdDept) {
    console.log(`  ⚠ "${MOVE_FROM}" not found in Department collection — skipping`);
  } else if (fdDept.status === 'inactive') {
    console.log(`  ✓ "${MOVE_FROM}" already inactive — no change needed`);
  } else {
    // Verify no active users remain
    const remaining = await User.countDocuments({ department: MOVE_FROM, status: 'Active' });
    if (remaining > 0 && DRY_RUN) {
      console.log(`  → Will deactivate after users are moved (${remaining} active users will be moved first)`);
    } else if (remaining > 0 && !DRY_RUN) {
      console.log(`  ⚠ ${remaining} active users still in "${MOVE_FROM}" — something went wrong, skipping deactivation`);
    } else {
      console.log(`  → "${MOVE_FROM}" (currently: ${fdDept.status}) → will set inactive`);
      if (!DRY_RUN) {
        fdDept.status = 'inactive';
        fdDept.updatedAt = new Date();
        await fdDept.save();
        console.log(`    ✓ Done`);
      }
    }
  }

  // ── Summary ──
  console.log('\n═══ Summary ═══');
  const activeDepts = await Department.countDocuments({ status: 'active' });
  const inactiveDepts = await Department.countDocuments({ status: 'inactive' });
  console.log(`  Active departments: ${activeDepts}`);
  console.log(`  Inactive departments: ${inactiveDepts}`);

  if (DRY_RUN) {
    console.log('\n*** DRY RUN complete. No changes made. ***');
    console.log('Run without --dry-run to apply.');
  } else {
    console.log('\n✓ Cleanup complete.');
  }

  await mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
