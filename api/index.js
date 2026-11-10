import '../src/config/load-env.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

const config = loadConfig();
const app = createApp(config);
let connection;

export default async function handler(req, res) {
  try {
    // Share one pool across warm invocations and concurrent cold-start requests.
    connection ??= connectDatabase(config).catch(error => {
      connection = undefined;
      throw error;
    });
    await connection;
  } catch (error) {
    logger.error('database_unavailable', { errorType: error.name, errorCode: error.code });
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: {
      code: 'SERVICE_UNAVAILABLE', message: 'Database is temporarily unavailable',
    } }));
  }
  return app(req, res);
}
