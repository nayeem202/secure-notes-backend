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
  console.error('Index setup failed. Check environment configuration and MongoDB permissions.', error.name, error.code ?? '');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
