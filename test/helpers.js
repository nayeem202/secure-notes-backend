import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/services/users.js';
import { issueToken } from '../src/utils/tokens.js';

export const testPassword = 'correct-horse-42-battery';
export const silentLogger = { info() {}, error() {} };

export async function testEnvironment() {
  // Never connect tests to the application's MONGODB_URI or an existing DB.
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: { version: process.env.MONGOMS_VERSION || '8.0.18', downloadDir: resolve('.cache/mongodb') },
  });
  const config = loadConfig({
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri('secure_notes_test'),
    JWT_SECRET: randomBytes(48).toString('hex'), BCRYPT_ROUNDS: '10',
    API_RATE_LIMIT: '100000', AUTH_RATE_LIMIT: '10000', APP_ORIGIN: 'http://localhost:5500', SERVE_FRONTEND: 'false',
  });
  try { await connectDatabase(config); } catch (error) { await mongo.stop(); throw error; }
  return {
    config, app: createApp(config, { logger: silentLogger }),
    async close() { await disconnectDatabase(); await mongo.stop(); },
  };
}

export async function fixtureUsers(config) {
  const [alice, bob, admin] = await Promise.all([
    createUser({ name: 'Alice', username: 'alice.reader', email: 'alice@example.com', password: testPassword, role: 'user', interests: ['chess', 'reading'] }, config),
    createUser({ name: 'Bob', username: 'bob.reader', email: 'bob@example.com', password: testPassword, role: 'user', interests: ['chess'] }, config),
    createUser({ name: 'Admin', username: 'admin.owner', email: 'admin@example.com', password: testPassword, role: 'admin', interests: [] }, config),
  ]);
  return Object.fromEntries(Object.entries({ alice, bob, admin }).map(([name, user]) => [name, {
    user, id: String(user._id), token: issueToken(user, config),
  }]));
}
