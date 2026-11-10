import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? sourceFiles(resolve(directory, entry.name)) : entry.name.endsWith('.js') ? [resolve(directory, entry.name)] : []))).flat();
}

test('architecture dependencies point inward and HTTP adapters do not import persistence', async () => {
  for (const file of await sourceFiles(root)) {
    const path = relative(root, file).replaceAll('\\', '/');
    const layer = path.split('/')[0];
    const allowed = {
      domain: ['domain'],
      application: ['application', 'domain'],
      infrastructure: ['infrastructure', 'application', 'domain'],
      interfaces: ['interfaces', 'application', 'domain'],
    }[layer];
    if (!allowed) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        assert.ok(!['domain', 'application'].includes(layer), `${path} imports external dependency ${specifier}`);
        continue;
      }
      const target = relative(root, resolve(dirname(file), specifier)).replaceAll('\\', '/').split('/')[0];
      assert.ok(allowed.includes(target), `${path} depends on outer layer ${specifier}`);
    }
  }
});
