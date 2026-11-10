import '../src/config/load-env.js';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { adminCreateBody } from '../src/validation/schemas.js';
import { createUser } from '../src/services/users.js';

try {
  const config = loadConfig();
  const parsed = adminCreateBody.safeParse({
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator',
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    role: 'admin',
  });
  if (!parsed.success) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_USERNAME, and BOOTSTRAP_ADMIN_PASSWORD; use a password of 6-72 UTF-8 bytes');
  }
  await connectDatabase(config);
  const existing = await User.findOne({ email: parsed.data.email });
  if (existing) {
    if (existing.role !== 'admin' || !existing.isActive) {
      throw new Error('That email belongs to another account; use the admin API to manage it');
    }
    if (existing.username !== parsed.data.username) throw new Error(`That email already belongs to @${existing.username}`);
    console.log(`An active administrator already exists as @${existing.username}; no changes made.`);
  } else {
    const username = await User.findOne({ username: parsed.data.username }).select('_id').lean();
    if (username) throw new Error('That username is already taken');
    const user = await createUser(parsed.data, config);
    console.log(`Administrator created: @${user.username}. Remove BOOTSTRAP_ADMIN_PASSWORD from .env.`);
  }
} catch (error) {
  const safeMessage = error.name === 'Error' ? error.message : 'Check database access and environment configuration';
  console.error(`Administrator setup failed: ${safeMessage}`);
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
