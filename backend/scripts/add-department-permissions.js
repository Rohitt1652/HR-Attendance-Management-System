/**
 * Safely add department permissions to existing roles.
 * Does NOT reset or remove any existing permissions.
 * Only ADDS missing department permissions.
 * 
 * Run: node scripts/add-department-permissions.js
 * Safe to run multiple times (idempotent).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';

const NEW_PERMS = {
  // Admin + MD: full department access
  admin: ['departments:view', 'departments:create', 'departments:edit', 'departments:delete'],
  md:    ['departments:view', 'departments:create', 'departments:edit', 'departments:delete'],
  // HR: view, create, edit (no delete)
  hr:    ['departments:view', 'departments:create', 'departments:edit'],
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
      console.log(`✓ ${roleName}: already has all department permissions`);
    } else {
      role.permissions = [...existing, ...missing];
      role.updatedAt = new Date();
      await role.save();
      console.log(`✓ ${roleName}: added ${missing.join(', ')}`);
    }
  }

  console.log('\nDone. Existing permissions preserved. Only department permissions were added.');
  await mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
