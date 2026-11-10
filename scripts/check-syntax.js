import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(entry => !['node_modules', '.git', '.cache', '.local', 'test-results'].includes(entry.name))
    .map(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
}
const scripts = (await files(root)).filter(file => file.endsWith('.js'));
for (const file of scripts) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr || `Syntax check failed: ${file}`);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
    await access(resolve(dirname(file), match[1]));
  }
}
try {
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) await access(resolve(root, `public${match[1]}`));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
console.log(`Checked syntax and local imports in ${scripts.length} JavaScript files.`);
