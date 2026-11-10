import { test } from 'node:test';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import {
  dockerCommandEnvironment,
  isLocalDockerEndpoint,
  localOrigin,
} from '../scripts/start-docker-windows.js';

test('Windows Docker launcher accepts local pipes and rejects remote daemon endpoints', () => {
  assert.equal(isLocalDockerEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine'), true);
  assert.equal(isLocalDockerEndpoint('npipe://./pipe/docker_engine'), true);
  for (const endpoint of [
    'tcp://remote:2375',
    'ssh://server',
    'npipe:////other-machine/pipe/docker_engine',
    'unix:///var/run/docker.sock',
    null,
  ]) {
    assert.equal(isLocalDockerEndpoint(endpoint), false);
  }
});

test('Windows Docker launcher allows a local frontend origin separate from the backend port', () => {
  assert.equal(localOrigin('http://localhost:3000', 3000).origin, 'http://localhost:3000');
  assert.equal(localOrigin('http://127.0.0.1:4321', 3000).port, '4321');
  for (const [origin, port] of [
    ['https://example.com', 443],
    ['http://localhost:3000/path', 3000],
    ['http://user:pass@localhost:3000', 3000],
    ['http://localhost:3000', 0],
  ]) {
    assert.throws(() => localOrigin(origin, port));
  }
});

test('Docker CLI and credential helper directories are added to the child process PATH', () => {
  const result = dockerCommandEnvironment(
    { PATH: 'existing-path' },
    '/opt/docker/resources/bin/docker.exe',
    ['/opt/docker'],
  );
  const paths = result.PATH.split(delimiter);
  assert.equal(paths[0], '/opt/docker/resources/bin');
  assert.ok(paths.includes('existing-path'));
});
