import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export async function prepareLocalEnvironment(directory = projectRoot) {
  const envFile = resolve(directory, '.env');
  let created = false;
  let source;
  try {
    source = await readFile(envFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    source = await readFile(resolve(directory, '.env.example'), 'utf8');
    created = true;
  }
  const existing = /^[ \t]*JWT_SECRET[ \t]*=[ \t]*([^\r\n]*)/m.exec(source);
  const rawValue = existing?.[1].trim();
  const needsSecret =
    !existing || !rawValue || ['""', "''"].includes(rawValue) || rawValue.startsWith('#');
  if (needsSecret) {
    const line = `JWT_SECRET=${randomBytes(48).toString('hex')}`;
    source = existing
      ? source.replace(/^[ \t]*JWT_SECRET[ \t]*=[^\r\n]*/m, line)
      : `${source}${source.endsWith('\n') ? '' : '\n'}${line}\n`;
  }
  if (created || needsSecret) {
    try {
      await writeFile(envFile, source, {
        encoding: 'utf8',
        mode: 0o600,
        ...(created ? { flag: 'wx' } : {}),
      });
    } catch (error) {
      if (created && error.code === 'EEXIST') return prepareLocalEnvironment(directory);
      throw error;
    }
  }
  return { created, generatedSecret: needsSecret };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) {
    console.error('Node.js 20.19 or later is required.');
    process.exitCode = 1;
  } else {
    try {
      const result = await prepareLocalEnvironment();
      console.log(
        result.created || result.generatedSecret
          ? 'Local .env is configured; the JWT secret is kept private.'
          : 'Existing .env preserved.',
      );
    } catch {
      console.error('Could not prepare .env. Check project folder write permissions.');
      process.exitCode = 1;
    }
  }
}
