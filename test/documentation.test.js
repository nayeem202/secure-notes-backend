import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/bootstrap/env.js';
import { createOpenApi } from '../src/interfaces/http/documentation/openapi.js';

const environment = {
  NODE_ENV: 'test',
  JWT_SECRET: randomBytes(48).toString('hex'),
  MONGODB_URI: 'mongodb://localhost:27017/documentation',
  BCRYPT_ROUNDS: '10',
  APP_ORIGIN: 'http://localhost:5500',
  API_ORIGIN: 'http://localhost:3000',
  SERVE_FRONTEND: 'false',
};
const config = loadConfig(environment);
const app = createApp(config, { logger: { info() {}, error() {} } });

test('the OpenAPI contract validates and separates public reads from authenticated operations', async () => {
  const spec = createOpenApi(config);
  await SwaggerParser.validate(structuredClone(spec));
  const ids = [];
  for (const item of Object.values(spec.paths)) {
    for (const method of ['get', 'post', 'patch', 'delete']) {
      if (item[method]) ids.push(item[method].operationId);
    }
  }
  assert.equal(ids.length, 26);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
  assert.deepEqual(spec.paths['/api/posts'].get.security, []);
  assert.deepEqual(spec.paths['/api/users/{username}/posts'].get.security, []);
  assert.equal(spec.paths['/api/notes'].get.security, undefined);
  assert.equal(spec.paths['/api/admin/users'].get.security, undefined);
  assert.deepEqual(
    Object.keys(spec.components.schemas.PublicUserPosts.properties.user.properties),
    ['username'],
  );
});

test('interactive documentation and its local assets load with the existing script policy', async () => {
  const response = await request(app).get('/docs').expect(200).expect('Content-Type', /html/);
  assert.match(response.text, /Secure Notes API/);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.doesNotMatch(response.headers['content-security-policy'], /script-src[^;]*unsafe-inline/);
  for (const path of [
    '/docs/',
    '/docs/swagger-ui.css',
    '/docs/swagger-ui-bundle.js',
    '/docs/swagger-init.js',
  ]) {
    await request(app).get(path).expect(200);
  }
  const spec = await request(app).get('/openapi.json').expect(200);
  assert.equal(spec.body.servers[0].url, config.API_ORIGIN);
  await request(app).get('/docs/package.json').expect(404);
  await request(app).get('/api/notes').expect(401);
});

test('the documentation API origin must be an exact HTTP origin and HTTPS in production', () => {
  assert.equal(
    loadConfig({ ...environment, API_ORIGIN: undefined, PORT: '3100' }).API_ORIGIN,
    'http://localhost:3100',
  );
  for (const API_ORIGIN of [
    'https://api.example.com/',
    'https://api.example.com/docs',
    'file:///tmp/docs',
  ]) {
    assert.throws(() => loadConfig({ ...environment, API_ORIGIN }));
  }
  assert.throws(() =>
    loadConfig({
      ...environment,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://frontend.example.com',
      API_ORIGIN: 'http://api.example.com',
    }),
  );
});
