import { createAccountWriter } from '../application/account-write.js';
import { createAuthUseCases } from '../application/auth.js';
import { createNoteUseCases } from '../application/notes.js';
import { createPostUseCases } from '../application/posts.js';
import { createUserUseCases } from '../application/users.js';
import { createAnalyticsUseCases } from '../application/analytics.js';
import { createRepositories } from '../infrastructure/database/repositories.js';
import { createTransactions } from '../infrastructure/database/transactions.js';
import { databaseReady } from '../infrastructure/database/connection.js';
import { createPasswordHasher } from '../infrastructure/security/passwords.js';
import { createTokenService } from '../infrastructure/security/tokens.js';
import { logger } from '../infrastructure/observability/logger.js';

export function createContainer(config) {
  const repositories = createRepositories({ queryTimeoutMs: config.QUERY_TIMEOUT_MS });
  const passwords = createPasswordHasher(config.BCRYPT_ROUNDS);
  const tokens = createTokenService(config);
  const accountWrite = createAccountWriter(createTransactions(config.QUERY_TIMEOUT_MS));
  const dependencies = { repositories, passwords, tokens, accountWrite };
  return {
    useCases: {
      auth: createAuthUseCases(dependencies),
      notes: createNoteUseCases(dependencies),
      posts: createPostUseCases(dependencies),
      users: createUserUseCases(dependencies),
      analytics: createAnalyticsUseCases(dependencies),
    },
    repositories, passwords, tokens, health: databaseReady, logger,
  };
}
