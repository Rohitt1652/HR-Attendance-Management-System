const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
    throw new Error('CRITICAL SAFETY BLOCK: Test database URI must be local MongoMemoryServer (127.0.0.1)!');
  }
  await mongoose.connect(uri);
  if (mongoose.connection.host !== '127.0.0.1' && mongoose.connection.host !== 'localhost') {
    await mongoose.disconnect();
    throw new Error('CRITICAL SAFETY BLOCK: Connected host is not local in-memory server. Aborting tests.');
  }
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

module.exports = { connectTestDb, disconnectTestDb, clearCollections };
