/**
 * Sync Department.teamLeaderId from existing User.teamLeadId data.
 * 
 * Usage:
 *   node scripts/sync-department-team-leaders.js --dry-run   (preview only)
 *   node scripts/sync-department-team-leaders.js             (live run)
 *   node scripts/sync-department-team-leaders.js --force     (overwrite existing assignments)
 * 
 * Logic:
 *   - Groups active users by department
 *   - Counts teamLeadId frequency per department
 *   - Assigns the most common teamLeadId as Department.teamLeaderId
 *   - Skips departments that already have teamLeaderId (unless --force)
 * 
 * Safety:
 *   - Does NOT modify User records
 *   - Does NOT delete anything
 *   - Does NOT touch Settings, leaves, or permissions
 *   - Only updates Department.teamLeaderId
 *   - Idempotent
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Department = require('../src/models/Department');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '*** DRY RUN — no changes will be made ***' : '');
  console.log(FORCE ? '*** FORCE MODE — will overwrite existing assignments ***' : '');
  console.log('');

  // Get all active departments
  const departments = await Department.find({ status: 'active' }).lean();
  console.log(`Active departments: ${departments.length}\n`);

  // Get all active users with teamLeadId set, grouped by department
  const usersWithTL = await User.find({
    status: 'Active',
    teamLeadId: { $ne: null },
    department: { $ne: null },
  }).select('name department teamLeadId').populate('teamLeadId', 'name').lean();

  // Group by department
  const deptGroups = {};
  usersWithTL.forEach(u => {
    const dept = u.department;
    if (!deptGroups[dept]) deptGroups[dept] = [];
    deptGroups[dept].push(u);
  });

  let updated = 0;
  let skipped = 0;

  console.log('═══ Department Team Leader Analysis ═══\n');

  for (const dept of departments) {
    const users = deptGroups[dept.name] || [];
    const activeCount = await User.countDocuments({ department: dept.name, status: 'Active' });

    console.log(`📁 ${dept.name}`);
    console.log(`   Active users: ${activeCount}`);

    if (users.length === 0) {
      console.log(`   Team lead candidates: none (no users with teamLeadId in this dept)`);
      console.log(`   Action: SKIP (no data to derive from)`);
      console.log('');
      skipped++;
      continue;
    }

    // Count frequency of each team lead
    const tlCounts = {};
    users.forEach(u => {
      const tlId = u.teamLeadId?._id?.toString();
      const tlName = u.teamLeadId?.name || 'Unknown';
      if (tlId) {
        if (!tlCounts[tlId]) tlCounts[tlId] = { name: tlName, count: 0 };
        tlCounts[tlId].count++;
      }
    });

    // Sort by count descending
    const candidates = Object.entries(tlCounts)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count);

    console.log(`   Team lead candidates:`);
    candidates.forEach(c => console.log(`     • ${c.name}: ${c.count} user(s)`));

    const winner = candidates[0];
    console.log(`   Selected: ${winner.name} (${winner.count} assignments)`);

    // Check if already set
    const currentTL = dept.teamLeaderId?.toString();
    if (currentTL && !FORCE) {
      const currentTLUser = await User.findById(currentTL).select('name').lean();
      console.log(`   Current: ${currentTLUser?.name || currentTL} (already set — SKIP)`);
      console.log(`   Action: SKIP (use --force to overwrite)`);
      skipped++;
    } else if (currentTL && FORCE) {
      console.log(`   Action: OVERWRITE → ${winner.name}`);
      if (!DRY_RUN) {
        await Department.updateOne({ _id: dept._id }, { teamLeaderId: winner.id, updatedAt: new Date() });
        console.log(`   ✓ Updated`);
      }
      updated++;
    } else {
      console.log(`   Current: not set`);
      console.log(`   Action: SET → ${winner.name}`);
      if (!DRY_RUN) {
        await Department.updateOne({ _id: dept._id }, { teamLeaderId: winner.id, updatedAt: new Date() });
        console.log(`   ✓ Updated`);
      }
      updated++;
    }
    console.log('');
  }

  // Summary
  console.log('═══ Summary ═══');
  console.log(`  Departments updated: ${updated}`);
  console.log(`  Departments skipped: ${skipped}`);
  console.log(`  User records modified: 0`);
  console.log(`  Settings modified: no`);
  console.log(`  Leaves modified: no`);
  console.log(`  Permissions modified: no`);

  if (DRY_RUN) {
    console.log('\n*** DRY RUN complete. No changes made. ***');
    console.log('Run without --dry-run to apply.');
  } else {
    console.log('\n✓ Sync complete. Departments page will now show Team Leaders.');
  }

  await mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
