require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const database = mongoose.connection.db;
  const outputDir = path.resolve(__dirname, '..', 'backups', `mongodb-${timestamp()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const manifest = {
    database: database.databaseName,
    createdAt: new Date().toISOString(),
    format: 'MongoDB Extended JSON v2',
    collections: [],
  };

  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const documents = await database.collection(name).find({}).toArray();
    const file = `${name}.json`;
    await fs.writeFile(
      path.join(outputDir, file),
      EJSON.stringify(documents, null, 2, { relaxed: false }),
      'utf8'
    );
    manifest.collections.push({ name, file, documents: documents.length });
    console.log(`${name}: ${documents.length}`);
  }

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`BACKUP_PATH=${outputDir}`);
  console.log(`TOTAL_DOCUMENTS=${manifest.collections.reduce((sum, item) => sum + item.documents, 0)}`);
}

main()
  .catch((error) => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
