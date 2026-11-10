import '../src/bootstrap/load-env.js';
import { loadConfig } from '../src/bootstrap/env.js';
import { createContainer } from '../src/bootstrap/container.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/connection.js';
import { adminCreateBody } from '../src/interfaces/http/validation/schemas.js';
import { ApplicationError } from '../src/domain/application-error.js';

try {
  const config = loadConfig();
  const parsed = adminCreateBody.safeParse({
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'Administrator',
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    role: 'admin',
  });
  if (!parsed.success)
    throw new Error(
      'Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_USERNAME, and BOOTSTRAP_ADMIN_PASSWORD; use a password of 6-72 UTF-8 bytes',
    );
  await connectDatabase(config);
  const { user, created } = await createContainer(config).useCases.users.bootstrapAdmin(
    parsed.data,
  );
  console.log(
    created
      ? `Administrator created: @${user.username}. Remove BOOTSTRAP_ADMIN_PASSWORD from .env.`
      : `An active administrator already exists as @${user.username}; no changes made.`,
  );
} catch (error) {
  const message =
    error instanceof ApplicationError || error.name === 'Error'
      ? error.message
      : 'Check database access and environment configuration';
  console.error(`Administrator setup failed: ${message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
