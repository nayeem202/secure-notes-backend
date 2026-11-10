import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Note } from './models/Note.js';
import { Post } from './models/Post.js';

export const models = [User, Note, Post];

export async function connectDatabase(config, { verifyIndexes = true } = {}) {
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);
  mongoose.set('maxTimeMS', config.QUERY_TIMEOUT_MS);
  await mongoose.connect(config.MONGODB_URI, {
    family: 4,
    autoIndex: false,
    autoCreate: false,
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: config.QUERY_TIMEOUT_MS + 5000,
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error(
      'MongoDB must be a replica set or sharded cluster; run docker compose up -d --wait',
    );
  }
  if (config.AUTO_INDEX) await createIndexes();
  if (verifyIndexes) await assertRequiredIndexes();
  return mongoose.connection;
}

export async function assertRequiredIndexes() {
  for (const Model of models) {
    let actual;
    try {
      actual = await Model.collection.indexes();
    } catch {
      throw new Error('Required collections/indexes are missing; run npm run db:indexes');
    }
    for (const [key, options] of Model.schema.indexes()) {
      const index = actual.find((candidate) => candidate.name === options.name);
      if (
        !index ||
        JSON.stringify(index.key) !== JSON.stringify(key) ||
        Boolean(index.unique) !== Boolean(options.unique)
      ) {
        throw new Error(
          `Required index ${options.name} is missing or incompatible; run npm run db:indexes`,
        );
      }
    }
  }
}

export async function createIndexes() {
  for (const Model of models) {
    await Model.createCollection();
    if (Model === User) await ensureLegacyUsernames();
    await Model.createIndexes();
  }
}

async function ensureLegacyUsernames() {
  const indexes = await User.collection.indexes();
  if (indexes.some((index) => index.name === 'users_username_unique')) return;
  const used = new Set();
  for await (const user of User.collection.find(
    { username: { $type: 'string' } },
    { projection: { username: 1 } },
  )) {
    used.add(user.username.toLowerCase());
  }
  const missing = User.collection
    .find(
      { $or: [{ username: { $exists: false } }, { username: null }, { username: '' }] },
      { projection: { email: 1 } },
    )
    .sort({ _id: 1 });
  let operations = [];
  for await (const user of missing) {
    const suffix = String(user._id).slice(-8);
    let base = user.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/^[._-]+|[._-]+$/g, '');
    if (!/^[a-z0-9].*[a-z0-9]$/.test(base) || base.length < 3) base = `user-${suffix}`;
    base = base.slice(0, 30).replace(/[._-]+$/g, '');
    let candidate = base;
    if (used.has(candidate)) candidate = `${base.slice(0, 21).replace(/[._-]+$/g, '')}-${suffix}`;
    let sequence = 1;
    while (used.has(candidate)) {
      const ending = `-${suffix}-${sequence++}`;
      candidate = `${base.slice(0, 30 - ending.length).replace(/[._-]+$/g, '')}${ending}`;
    }
    operations.push({
      updateOne: { filter: { _id: user._id }, update: { $set: { username: candidate } } },
    });
    used.add(candidate);
    if (operations.length === 500) {
      await User.collection.bulkWrite(operations, { ordered: true });
      operations = [];
    }
  }
  if (operations.length) await User.collection.bulkWrite(operations, { ordered: true });
}

export const disconnectDatabase = () => mongoose.disconnect();

export async function databaseReady() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().command({ ping: 1 }, { timeoutMS: 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function retireLegacyInterestIndex() {
  const indexes = await User.collection.indexes();
  const replacement = indexes.find((index) => index.name === 'users_interests_id');
  if (
    !replacement ||
    JSON.stringify(replacement.key) !== JSON.stringify({ interests: 1, _id: 1 })
  ) {
    throw new Error('Create the compound interest index before retiring the legacy index');
  }
  const legacy = indexes.find((index) => index.name === 'users_interests');
  if (legacy) {
    if (JSON.stringify(legacy.key) !== JSON.stringify({ interests: 1 }) || legacy.unique) {
      throw new Error('Legacy interest index is incompatible; review it before removal');
    }
    await User.collection.dropIndex(legacy.name);
  }
}
