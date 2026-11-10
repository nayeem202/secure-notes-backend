import './src/bootstrap/load-env.js';
import { createApp } from './src/app.js';
import { loadConfig } from './src/bootstrap/env.js';
import { connectDatabase, disconnectDatabase } from './src/infrastructure/database/connection.js';
import { logger } from './src/infrastructure/observability/logger.js';

let config;
try { config = loadConfig(); } catch (error) {
  logger.error('invalid_configuration', { message: error.message });
  process.exit(1);
}

let server;
let stopping = false;
async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.info('shutdown_started', { signal });
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
    }
    await disconnectDatabase();
  } catch { exitCode = 1; }
  clearTimeout(deadline);
  process.exitCode = exitCode;
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('unhandledRejection', () => { void shutdown('unhandledRejection', 1); });
process.on('uncaughtException', () => { void shutdown('uncaughtException', 1); });

try {
  await connectDatabase(config);
  const app = createApp(config);
  server = app.listen(config.PORT, config.HOST, () => logger.info('server_started', {
    address: config.APP_ORIGIN, port: config.PORT, environment: config.NODE_ENV,
  }));
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('error', () => { void shutdown('listen_error', 1); });
} catch (error) {
  logger.error('startup_failed', {
    errorType: error.name, errorCode: error.code,
    hint: 'Check MongoDB connectivity, replica set configuration, and index permissions',
  });
  await shutdown('startup_failed', 1);
}
