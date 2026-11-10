import mongoose from 'mongoose';
import { createRepositories } from './repositories.js';
import { persistenceError } from './errors.js';

export function createTransactions(queryTimeoutMs) {
  return {
    async run(work) {
      try {
        return await mongoose.connection.transaction(
          session => work(createRepositories({ session, queryTimeoutMs })),
          {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            maxCommitTimeMS: 10000,
          },
        );
      } catch (error) { throw persistenceError(error); }
    },
  };
}
