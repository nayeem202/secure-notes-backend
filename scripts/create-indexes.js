import '../src/config/load-env.js';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, createIndexes, disconnectDatabase, models } from '../src/config/database.js';

try {
  await connectDatabase({ ...loadConfig(), AUTO_INDEX: false }, { verifyIndexes: false });
  await createIndexes();
  for (const Model of models) {
    console.log(Model.collection.name, (await Model.collection.indexes()).map(index => ({
      name: index.name, key: index.key, unique: Boolean(index.unique),
    })));
  }
} catch (error) {
  const servers = error.reason?.servers;
  const endpoints = servers instanceof Map
    ? [...servers].map(([address, server]) => `${address}=${server.error?.code ?? server.type}`).join(', ')
    : undefined;
  const safeMessage = String(error.message ?? '').replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[connection string redacted]');
  const details = {
    name: error.name, code: error.code, address: error.address, port: error.port, syscall: error.syscall,
    message: safeMessage, endpoints,
  };
  console.error('Index setup failed. Check Atlas network access and database permissions.', JSON.stringify(details));
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
