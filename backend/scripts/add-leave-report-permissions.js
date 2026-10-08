/**
 * Add leave_summary:view and monthly_record:view permissions to Admin and HR roles.
 * Does NOT overwrite existing permissions. Add-only, idempotent.
 * 
 * Run: node scripts/add-leave-report-permissions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

const NEW_PERMS = {
  admin: ['leave_summary:view', 'monthly_record:view'],
  md:    ['leave_summary:view', 'monthly_record:view'],
  hr:    ['leave_summary:view', 'monthly_record:view'],
  // team_lead: intentionally excluded — they should not have these by default
};

mongoose.connect(MONGO_URI).then(async () => {
  console.log('Connected to MongoDB\n');

  const Role = mongoose.models.Role || mongoose.model('Role', new mongoose.Schema({
    name: String, permissions: [String], updatedAt: Date,
  }));

  for (const [roleName, permsToAdd] of Object.entries(NEW_PERMS)) {
    const role = await Role.findOne({ name: roleName });
    if (!role) {
      console.log(`⚠ Role "${roleName}" not found — skipping`);
      continue;
    }

    const existing = role.permissions || [];
    const missing = permsToAdd.filter(p => !existing.includes(p));

    if (missing.length === 0) {
      console.log(`✓ ${roleName}: already has leave report permissions`);
    } else {
      role.permissions = [...existing, ...missing];
      role.updatedAt = new Date();
      await role.save();
      console.log(`✓ ${roleName}: added ${missing.join(', ')}`);
    }
  }

  // Verify team_lead does NOT have these
  const tl = await Role.findOne({ name: 'team_lead' });
  if (tl) {
    const has = ['leave_summary:view', 'monthly_record:view'].filter(p => (tl.permissions || []).includes(p));
    if (has.length > 0) {
      console.log(`\n⚠ team_lead has: ${has.join(', ')} — remove manually from Roles & Permissions if not intended`);
    } else {
      console.log(`\n✓ team_lead: does NOT have leave report permissions (correct)`);
    }
  }

  console.log('\nDone. Existing permissions preserved.');
  await mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
