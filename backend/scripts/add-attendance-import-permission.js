require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/Role');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/office-attendance';
const PERMISSION = 'attendance:import';

async function run() {
  await mongoose.connect(MONGO_URI);

  const grant = await Role.updateMany(
    { name: { $in: ['admin', 'md', 'hr'] } },
    { $addToSet: { permissions: PERMISSION }, $set: { updatedAt: new Date() } }
  );

  const revoke = await Role.updateMany(
    { name: 'team_lead' },
    { $pull: { permissions: PERMISSION }, $set: { updatedAt: new Date() } }
  );

  console.log('attendance:import migration complete', {
    grantedMatched: grant.matchedCount,
    grantedModified: grant.modifiedCount,
    teamLeadMatched: revoke.matchedCount,
    teamLeadModified: revoke.modifiedCount,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
