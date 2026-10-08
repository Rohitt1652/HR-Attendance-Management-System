/**
 * Migration: Add employees:edit_team permission to Team Lead role.
 * This allows team leads to edit employees in their team only.
 * 
 * Also removes employees:edit from team_lead if present (replaces with team-scoped version).
 *
 * Run: node scripts/add-edit-team-permission.js
 * Safe to run multiple times (idempotent).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const roles = mongoose.connection.collection('roles');

  // Add employees:edit_team to team_lead (if not already there)
  const teamLead = await roles.findOne({ name: 'team_lead' });
  if (teamLead) {
    const perms = teamLead.permissions || [];
    let modified = false;

    // Remove employees:edit if present (replace with team-scoped)
    if (perms.includes('employees:edit')) {
      await roles.updateOne({ name: 'team_lead' }, { $pull: { permissions: 'employees:edit' } });
      console.log('✓ Removed employees:edit from team_lead');
      modified = true;
    }

    // Add employees:edit_team if not present
    if (!perms.includes('employees:edit_team')) {
      await roles.updateOne({ name: 'team_lead' }, { $addToSet: { permissions: 'employees:edit_team' } });
      console.log('✓ Added employees:edit_team to team_lead');
      modified = true;
    } else {
      console.log('  employees:edit_team already present in team_lead');
    }

    if (!modified) console.log('  No changes needed for team_lead');
  } else {
    console.log('⚠ team_lead role not found');
  }

  // Ensure admin, hr, md keep employees:edit (full access)
  for (const roleName of ['admin', 'hr', 'md']) {
    const role = await roles.findOne({ name: roleName });
    if (role && !role.permissions.includes('employees:edit')) {
      await roles.updateOne({ name: roleName }, { $addToSet: { permissions: 'employees:edit' } });
      console.log(`✓ Ensured employees:edit on ${roleName}`);
    }
  }

  console.log('\nDone. Team lead can now only edit employees in their team.');
  console.log('Admin/HR/MD retain full edit access.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
