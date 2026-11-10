import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalEnvironment } from '../scripts/setup-local.js';

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'secure-notes-local-'));
  try {
    await writeFile(
      join(directory, '.env.example'),
      'NODE_ENV=development\nJWT_SECRET=\nPORT=3000\n',
    );
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('local setup creates a random secret and preserves it across restarts', async () =>
  fixture(async (directory) => {
    assert.deepEqual(await prepareLocalEnvironment(directory), {
      created: true,
      generatedSecret: true,
    });
    const first = await readFile(join(directory, '.env'), 'utf8');
    assert.match(first, /^JWT_SECRET=[a-f\d]{96}$/m);
    assert.deepEqual(await prepareLocalEnvironment(directory), {
      created: false,
      generatedSecret: false,
    });
    assert.equal(await readFile(join(directory, '.env'), 'utf8'), first);
  }));

test('local setup preserves existing configuration and credentials', async () =>
  fixture(async (directory) => {
    const original =
      'JWT_SECRET=' + 'a'.repeat(96) + '\nMONGODB_URI=mongodb://custom/test\nPORT=4567\n';
    await writeFile(join(directory, '.env'), original);
    await prepareLocalEnvironment(directory);
    assert.equal(await readFile(join(directory, '.env'), 'utf8'), original);
  }));

test('local setup fills a missing or quoted empty key without deleting other values', async () =>
  fixture(async (directory) => {
    for (const key of ['', 'JWT_SECRET=""\n', "JWT_SECRET=''\n"]) {
      await writeFile(join(directory, '.env'), key + 'PORT=4567\n');
      await prepareLocalEnvironment(directory);
      const contents = await readFile(join(directory, '.env'), 'utf8');
      assert.match(contents, /^JWT_SECRET=[a-f\d]{96}$/m);
      assert.match(contents, /^PORT=4567$/m);
    }
  }));
