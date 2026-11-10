import '../src/config/load-env.js';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, assertRequiredIndexes, disconnectDatabase } from '../src/config/database.js';

let stage = 'configuration';
try {
  // Always read-only, even when the local environment enables AUTO_INDEX.
  const config = loadConfig({ ...process.env, AUTO_INDEX: 'false' });
  stage = 'connection';
  const connection = await connectDatabase(config, { verifyIndexes: false });
  await connection.db.admin().command({ ping: 1 }, { timeoutMS: config.QUERY_TIMEOUT_MS });
  console.log('PASS: MongoDB connection, authentication, ping, and replica-set/sharded topology.');
  stage = 'indexes';
  await assertRequiredIndexes();
  console.log('PASS: All required collections and indexes exist.');
} catch (error) {
  // Driver messages can contain credentials. Report only the stage and error code.
  console.error('Database check failed.', { stage, errorType: error.name, errorCode: error.code });
  const hints = {
    configuration: 'Set MONGODB_URI and a valid JWT_SECRET in the backend .env or environment.',
    connection: 'Check the Atlas URI, database user/password, IP access list, DNS, and replica-set topology.',
    indexes: 'Required collections/indexes are missing, incompatible, or inaccessible. Review and run npm run db:indexes.',
  };
  console.error(hints[stage]);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
