/**
 * One-time migration: Settings.departments + User.department → Department collection
 * 
 * Usage:
 *   node scripts/migrate-departments.js --dry-run   (preview only, no DB changes)
 *   node scripts/migrate-departments.js             (live run, creates documents)
 * 
 * Behavior:
 *   - READS from: Settings.departments (legacy), User.department (distinct values)
 *   - CREATES in: departments collection (only missing names)
 *   - UPDATES: nothing
 *   - DELETES: nothing
 *   - Idempotent: safe to run multiple times
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('../src/models/Settings');
const Department = require('../src/models/Department');
const User = require('../src/models/User');

const DRY_RUN = process.argv.includes('--dry-run');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '*** DRY RUN — no changes will be made ***\n' : '');

  // Check existing departments
  const existing = await Department.find().select('name').lean();
  const existingNames = new Set(existing.map(d => d.name));
  console.log(`Existing departments in collection: ${existing.length}`);
  if (existing.length > 0) {
    existing.forEach(d => console.log(`  • ${d.name}`));
  }

  // Source 1: Settings.departments (legacy)
  const settings = await Settings.getGlobal();
  const legacy = (settings.departments || []).map(d => typeof d === 'string' ? d : (d.name || '')).filter(Boolean);
  console.log(`\nSettings.departments (legacy): ${legacy.length}`);
  legacy.forEach(d => console.log(`  • ${d}`));

  // Source 2: Unique departments from User records
  const empDepts = await User.distinct('department', { department: { $ne: null, $ne: '' } });
  console.log(`\nUser.department (distinct): ${empDepts.length}`);
  empDepts.filter(Boolean).forEach(d => console.log(`  • ${d}`));

  // Merge both sources, deduplicate
  const allNames = [...new Set([...legacy, ...empDepts.filter(Boolean)])].sort();
  const toCreate = allNames.filter(name => !existingNames.has(name));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total unique departments found: ${allNames.length}`);
  console.log(`Already in collection: ${allNames.length - toCreate.length}`);
  console.log(`Will be CREATED: ${toCreate.length}`);
  console.log(`Will be UPDATED: 0`);
  console.log(`Will be DELETED: 0`);
  console.log(`Users affected: 0`);
  console.log(`Settings modified: no`);
  console.log(`${'='.repeat(50)}\n`);

  if (toCreate.length === 0) {
    console.log('Nothing to do — all departments already exist.');
    await mongoose.disconnect();
    return;
  }

  console.log('Departments to create:');
  toCreate.forEach(name => console.log(`  + ${name}`));

  if (DRY_RUN) {
    console.log('\n*** DRY RUN complete. No changes made. ***');
    console.log('Run without --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  // Live run
  console.log('\nCreating...');
  let created = 0;
  for (const name of toCreate) {
    try {
      await Department.create({ name, status: 'active' });
      console.log(`  ✓ ${name}`);
      created++;
    } catch (err) {
      if (err.code === 11000) console.log(`  - ${name} (duplicate — skipped)`);
      else console.log(`  ✗ ${name}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${created} departments created.`);
  console.log('Assign Team Leaders from Admin → People → Departments.');
  await mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
