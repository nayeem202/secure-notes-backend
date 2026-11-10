import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareLocalEnvironment, projectRoot } from './setup-local.js';

class LocalStartupError extends Error {}
let database;
let app;
let appFinished;
let appResult;
let stopping = false;

function portOpen(host, port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePort(value);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function requestStop() {
  stopping = true;
  if (app && appResult === undefined) app.kill('SIGTERM');
}

async function main() {
  process.chdir(projectRoot);
  await prepareLocalEnvironment();
  await import('../src/bootstrap/load-env.js');
  const { loadConfig } = await import('../src/bootstrap/env.js');
  const config = loadConfig();
  if (config.NODE_ENV === 'production')
    throw new LocalStartupError(
      'This launcher is for local development. Use npm start for production.',
    );
  const origin = new URL(config.APP_ORIGIN);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
    Number(origin.port || 80) !== config.PORT
  ) {
    throw new LocalStartupError(
      'Set APP_ORIGIN to the matching local HTTP origin, for example http://localhost:3000.',
    );
  }
  const probeHost = ['0.0.0.0', '::'].includes(config.HOST) ? '127.0.0.1' : config.HOST;
  if (await portOpen(probeHost, config.PORT)) {
    throw new LocalStartupError(
      `Port ${config.PORT} is already in use. Check the existing app or change PORT and APP_ORIGIN together.`,
    );
  }

  const { default: mongoose } = await import('mongoose');
  const defaultUri = 'mongodb://127.0.0.1:27017/secure_notes?replicaSet=rs0&directConnection=true';
  if (config.MONGODB_URI === defaultUri && !(await portOpen('127.0.0.1', 27017))) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const dbPath = resolve(projectRoot, '.local/mongodb');
    await mkdir(dbPath, { recursive: true });
    console.log(
      'Starting a local MongoDB replica set. The first run downloads MongoDB; Docker is not required.',
    );
    database = new MongoMemoryReplSet({
      binary: { version: '8.0.18', downloadDir: resolve(projectRoot, '.cache/mongodb') },
      instanceOpts: [{ port: 27017, dbPath }],
      replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
    });
    try {
      await database.start();
    } catch {
      throw new LocalStartupError(
        'MongoDB could not start. Check the download/error above and whether port 27017 is occupied.',
      );
    }
    if (database.servers[0]?.instanceInfo?.port !== 27017) {
      throw new LocalStartupError(
        'MongoDB could not bind to port 27017. No application was started.',
      );
    }
    console.log('Local database files are kept in .local/mongodb.');
  }

  const probe = mongoose.createConnection(config.MONGODB_URI, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await probe.asPromise();
    const hello = await probe.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
      throw new LocalStartupError(
        'The existing MongoDB server is standalone. Use a replica set/Atlas URI or the supplied Compose configuration.',
      );
    }
  } catch (error) {
    if (error instanceof LocalStartupError) throw error;
    throw new LocalStartupError(
      'MongoDB is not reachable. Check MONGODB_URI, credentials, and replica set availability.',
    );
  } finally {
    await probe.close().catch(() => {});
  }

  app = spawn(process.execPath, [resolve(projectRoot, 'server.js')], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  appFinished = new Promise((resolveExit) => {
    const finish = (result) => {
      if (appResult !== undefined) return;
      appResult = result;
      resolveExit(result);
    };
    app.once('error', () => finish({ code: 1 }));
    app.once('exit', (code, signal) => finish({ code, signal }));
  });
  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  let ready = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && appResult === undefined && !stopping) {
    try {
      const response = await fetch(new URL('/health/ready', origin), {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok && (await response.json()).status === 'ready') {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (stopping) return;
  if (!ready)
    throw new LocalStartupError('The app did not become ready. Read the server error above.');
  console.log(`\nOpen ${config.APP_ORIGIN}\nKeep this window open. Press Ctrl+C to stop.\n`);
  const result = await appFinished;
  if (!stopping && result.code !== 0)
    throw new LocalStartupError(
      'The application stopped unexpectedly. Read the server output above.',
    );
}

try {
  await main();
} catch (error) {
  if (!stopping) {
    console.error(
      error instanceof LocalStartupError
        ? error.message
        : 'Local startup failed. Check .env and run npm install --include=dev first.',
    );
    process.exitCode = 1;
  }
} finally {
  if (app && appResult === undefined) {
    app.kill('SIGTERM');
    await Promise.race([appFinished, delay(8000)]);
    if (appResult === undefined) {
      app.kill('SIGKILL');
      await Promise.race([appFinished, delay(2000)]);
    }
  }
  if (database) {
    try {
      await database.stop({ doCleanup: false, force: false });
    } catch {
      console.error(
        'MongoDB shutdown did not finish normally. Local data files have been retained.',
      );
      process.exitCode = 1;
    }
  }
}
