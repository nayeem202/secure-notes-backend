import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../src/bootstrap/env.js';
import { adminUpdateBody, allNotesQuery, interestQuery, loginBody, noteCreateBody, noteUpdateBody,
  pageQuery, password, postCreateBody, registerBody } from '../src/interfaces/http/validation/schemas.js';
import { pageInfo } from '../src/domain/pagination.js';
import { issueToken, verifyToken } from '../src/infrastructure/security/tokens.js';
import { readSessionCookie, cookieName, sessionCookieOptions } from '../src/interfaces/http/session.js';
import { protectMutations } from '../src/interfaces/http/middleware/security.js';
import { authorize } from '../src/interfaces/http/middleware/rbac.js';
import { validate } from '../src/interfaces/http/middleware/validate.js';

const environment = {
  NODE_ENV: 'test', JWT_SECRET: randomBytes(48).toString('hex'),
  MONGODB_URI: 'mongodb://localhost:27017/test', APP_ORIGIN: 'http://localhost:3000',
};
const config = loadConfig(environment);

test('configuration validates secrets, origins, booleans, and production settings', () => {
  assert.equal(config.JWT_TTL_SECONDS, 900);
  assert.equal(config.AUTO_INDEX, true);
  for (const override of [
    { JWT_SECRET: 'short' }, { JWT_SECRET: 'replace-' + 'x'.repeat(60) },
    { MONGODB_URI: 'file:///tmp/db' }, { APP_ORIGIN: 'http://localhost:3000/' },
    { APP_ORIGIN: 'https://example.com/path' }, { PORT: '0' }, { BCRYPT_ROUNDS: '9' },
    { AUTO_INDEX: 'yes' }, { NODE_ENV: 'production' },
    { NODE_ENV: 'production', APP_ORIGIN: 'https://notes.example.com', AUTO_INDEX: 'true' },
  ]) assert.throws(() => loadConfig({ ...environment, ...override }));
  const production = loadConfig({ ...environment, NODE_ENV: 'production', APP_ORIGIN: 'https://notes.example.com' });
  assert.equal(production.AUTO_INDEX, false);
  assert.equal(sessionCookieOptions(production).secure, true);
  assert.ok(cookieName(production).startsWith('__Host-'));
});

test('registration normalizes email and interests and rejects privileged fields', () => {
  const input = { name: ' Alice ', username: ' Alice.Reader ', email: 'ALICE@example.com ', password: 'twelve-characters', interests: [' Chess ', 'chess', 'Reading'] };
  const result = registerBody.parse(input);
  assert.equal(result.email, 'alice@example.com');
  assert.equal(result.username, 'alice.reader');
  assert.deepEqual(result.interests, ['chess', 'reading']);
  for (const patch of [{ role: 'admin' }, { isActive: false }, { tokenVersion: 99 }, { passwordHash: 'x' }, { name: { $ne: null } }]) {
    assert.equal(registerBody.safeParse({ ...input, ...patch }).success, false);
  }
  assert.equal(loginBody.safeParse({ email: { $ne: null }, password: 'x' }).success, false);
});

test('password validation enforces bcrypt UTF-8 byte limits without trimming', () => {
  assert.equal(password.safeParse('é'.repeat(36)).success, true);
  assert.equal(password.safeParse('é'.repeat(37)).success, false);
  assert.equal(password.safeParse('a'.repeat(73)).success, false);
  assert.equal(password.parse(' abcdefghijkl '), ' abcdefghijkl ');
  assert.equal(password.safeParse('short').success, false);
});

test('pagination rejects injection, duplicate values, nonintegers, and excessive offsets', () => {
  assert.deepEqual(pageQuery.parse({}), { page: 1, limit: 10 });
  assert.deepEqual(pageQuery.parse({ page: '2', limit: '5' }), { page: 2, limit: 5 });
  for (const query of [
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1e3' }, { limit: '101' },
    { limit: '0' }, { limit: ['1', '2'] }, { page: '100001', limit: '100' }, { sort: 'passwordHash' },
  ]) assert.equal(pageQuery.safeParse(query).success, false, JSON.stringify(query));
  assert.equal(allNotesQuery.safeParse({ owner: { $ne: null } }).success, false);
  assert.equal(interestQuery.parse({ interest: ' Chess ' }).interest, 'chess');
  assert.deepEqual(pageInfo(0, { page: 1, limit: 10 }), {
    page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false,
  });
  assert.equal(pageInfo(11, { page: 1, limit: 10 }).hasNextPage, true);
});

test('content schemas reject owner reassignment, empty patches, and oversized content', () => {
  assert.deepEqual(noteCreateBody.parse({ title: ' Note ' }), { title: 'Note', content: '' });
  for (const body of [{ title: '' }, { title: 'x', owner: 'a'.repeat(24) }, { title: 'x', content: 'x'.repeat(20001) }]) {
    assert.equal(noteCreateBody.safeParse(body).success, false);
  }
  assert.equal(noteUpdateBody.safeParse({}).success, false);
  assert.equal(noteUpdateBody.safeParse({ $set: { title: 'x' } }).success, false);
  assert.equal(postCreateBody.safeParse({ title: 'x', content: '' }).success, false);
  assert.equal(adminUpdateBody.safeParse({ tokenVersion: 0 }).success, false);
});

test('JWT verification pins algorithm, issuer, audience, expiry, and claim types', () => {
  const user = { _id: 'a'.repeat(24), tokenVersion: 2 };
  const token = issueToken(user, config);
  const payload = verifyToken(token, config);
  assert.equal(payload.sub, user._id); assert.equal(payload.ver, 2);
  assert.equal(payload.role, undefined);
  assert.throws(() => verifyToken(token + 'x', config));
  const sign = (claims = {}, options = {}) => jwt.sign({ ver: 2, ...claims }, config.JWT_SECRET, {
    issuer: 'secure-notes', audience: 'secure-notes-api', subject: user._id, expiresIn: 900, ...options,
  });
  for (const invalid of [sign({}, { issuer: 'other' }), sign({}, { audience: 'other' }),
    sign({}, { algorithm: 'HS384' }), sign({}, { expiresIn: -1 }), sign({ ver: '2' }), sign({}, { subject: 'invalid' })]) {
    assert.throws(() => verifyToken(invalid, config));
  }
});

test('cookie parsing isolates the session name and tolerates malformed cookies', () => {
  assert.equal(readSessionCookie({ headers: { cookie: 'other=value; secure_notes_session=abc.def; next=x' } }, config), 'abc.def');
  assert.equal(readSessionCookie({ headers: { cookie: 'secure_notes_session=%XX' } }, config), undefined);
  assert.equal(readSessionCookie({ headers: {} }, config), undefined);
  assert.equal(sessionCookieOptions(config).httpOnly, true);
});

test('mutation protection allows the configured cross-site frontend and rejects untrusted writes', () => {
  const guard = protectMutations(config);
  const request = (headers = {}, method = 'POST', json = true) => ({ method, get: name => headers[name], is: () => json });
  assert.throws(() => guard(request(), {}, () => {}), error => error.status === 403);
  assert.throws(() => guard(request({ 'x-csrf-protection': '1', origin: 'https://evil.example' }), {}, () => {}), error => error.status === 403);
  assert.throws(() => guard(request({ authorization: 'Bearer token', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), {}, () => {}), error => error.status === 403);
  assert.throws(() => guard(request({ authorization: 'Bearer token', 'sec-fetch-site': 'cross-site' }), {}, () => {}), error => error.status === 403);
  assert.throws(() => guard(request({ 'x-csrf-protection': '1' }, 'POST', false), {}, () => {}), error => error.status === 415);
  let calls = 0;
  guard(request({ 'x-csrf-protection': '1', origin: config.APP_ORIGIN }), {}, () => calls++);
  guard(request({ 'x-csrf-protection': '1', origin: config.APP_ORIGIN, 'sec-fetch-site': 'cross-site' }), {}, () => calls++);
  guard(request({ authorization: 'Bearer token', origin: config.APP_ORIGIN, 'sec-fetch-site': 'cross-site' }), {}, () => calls++);
  guard(request({ authorization: 'Bearer token' }), {}, () => calls++);
  guard(request({}, 'GET'), {}, () => calls++);
  assert.equal(calls, 5);
});

test('RBAC rejects unauthenticated and non-admin requests', () => {
  const admin = authorize('admin');
  assert.throws(() => admin({}, {}, () => {}), error => error.status === 401);
  assert.throws(() => admin({ user: { role: 'user' } }, {}, () => {}), error => error.status === 403);
  let passed = false;
  admin({ user: { role: 'admin' } }, {}, () => { passed = true; });
  assert.equal(passed, true);
});

test('request validation gives field errors without including passwords', () => {
  const middleware = validate({ body: registerBody });
  assert.throws(() => middleware({ body: { password: 'secret' } }, {}, () => {}), error => {
    assert.equal(error.status, 400); assert.ok(error.details.length > 0);
    assert.equal(JSON.stringify(error.details).includes('secret'), false);
    return true;
  });
});
