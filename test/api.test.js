import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { User } from '../src/infrastructure/database/models/User.js';
import { Note } from '../src/infrastructure/database/models/Note.js';
import { Post } from '../src/infrastructure/database/models/Post.js';
import { createApp } from '../src/app.js';
import { retireLegacyInterestIndex } from '../src/infrastructure/database/connection.js';
import {
  userPostsPipeline,
  interestsPipeline,
} from '../src/infrastructure/database/aggregation-pipelines.js';
import { fixtureUsers, silentLogger, testEnvironment, testPassword } from './helpers.js';

let env;
let users;
before(
  async () => {
    env = await testEnvironment();
  },
  { timeout: 180000 },
);
after(async () => {
  if (env) await env.close();
});
beforeEach(async () => {
  await Promise.all([Note.deleteMany({}), Post.deleteMany({}), User.deleteMany({})]);
  users = await fixtureUsers(env.config);
});
const as = (actor, method, path) =>
  request(env.app)[method](path).set('Authorization', `Bearer ${users[actor].token}`);
const write = (method, path) => request(env.app)[method](path).set('X-CSRF-Protection', '1');
const note = (actor = 'alice', title = 'Private note') =>
  as(actor, 'post', '/api/v1/notes').send({ title, content: 'Private content' }).expect(201);

test('registration hashes passwords, normalizes fields, and rejects duplicate email and role injection', async () => {
  const payload = {
    name: 'New User',
    username: 'New.User',
    email: 'NEW@example.com',
    password: testPassword,
    interests: [' Chess ', 'chess'],
  };
  const response = await write('post', '/api/v1/auth/register').send(payload).expect(201);
  assert.equal(response.body.data.user.role, 'user');
  assert.deepEqual(response.body.data.user.interests, ['chess']);
  assert.equal(response.body.data.user.email, 'new@example.com');
  assert.equal(response.body.data.user.username, 'new.user');
  assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
  const stored = await User.findById(response.body.data.user._id).select('+passwordHash');
  assert.notEqual(stored.passwordHash, payload.password);
  assert.equal(await bcrypt.compare(payload.password, stored.passwordHash), true);
  await write('post', '/api/v1/auth/register').send(payload).expect(409);
  await write('post', '/api/v1/auth/register')
    .send({ ...payload, email: 'other@example.com', role: 'admin' })
    .expect(400);
  await write('post', '/api/v1/auth/register')
    .send({ ...payload, password: 'é'.repeat(37) })
    .expect(400);
});

test('login uses generic errors and issues an HttpOnly SameSite cookie', async () => {
  const missing = await write('post', '/api/v1/auth/login')
    .send({ email: 'missing@example.com', password: testPassword })
    .expect(401);
  const wrong = await write('post', '/api/v1/auth/login')
    .send({ email: 'alice@example.com', password: 'wrong' })
    .expect(401);
  assert.equal(missing.body.error.message, wrong.body.error.message);
  const response = await write('post', '/api/v1/auth/login')
    .send({ email: 'ALICE@example.com', password: testPassword })
    .expect(200);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
  assert.equal(response.body.data.expiresIn, 900);
  await request(env.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${response.body.data.accessToken}`)
    .expect(200);
});

test('cookie writes require CSRF header, the configured origin, and JSON', async () => {
  const login = await write('post', '/api/v1/auth/login')
    .send({ email: 'alice@example.com', password: testPassword })
    .expect(200);
  const cookie = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
  await request(env.app)
    .post('/api/v1/notes')
    .set('Cookie', cookie)
    .send({ title: 'Blocked' })
    .expect(403);
  await write('post', '/api/v1/notes')
    .set('Cookie', cookie)
    .set('Origin', 'https://evil.example')
    .send({ title: 'Blocked' })
    .expect(403);
  await write('post', '/api/v1/notes')
    .set('Cookie', cookie)
    .set('Origin', env.config.APP_ORIGIN)
    .send({ title: 'Allowed' })
    .expect(201);
  await write('post', '/api/v1/auth/login')
    .type('form')
    .send({ email: 'alice@example.com', password: testPassword })
    .expect(415);
  const crossOrigin = await request(env.app)
    .get('/api/v1/posts')
    .set('Origin', 'https://evil.example')
    .expect(200);
  assert.equal(crossOrigin.headers['access-control-allow-origin'], undefined);
});

test('JWT validation rejects missing, tampered, expired, and wrong-algorithm tokens', async () => {
  await request(env.app).get('/api/v1/notes').expect(401);
  for (const token of [
    users.alice.token + 'bad',
    jwt.sign({ ver: 0 }, env.config.JWT_SECRET, {
      subject: users.alice.id,
      issuer: 'secure-notes',
      audience: 'secure-notes-api',
      expiresIn: -1,
    }),
    jwt.sign({ ver: 0 }, env.config.JWT_SECRET, {
      algorithm: 'HS384',
      subject: users.alice.id,
      issuer: 'secure-notes',
      audience: 'secure-notes-api',
      expiresIn: 60,
    }),
  ])
    await request(env.app).get('/api/v1/notes').set('Authorization', `Bearer ${token}`).expect(401);
});

test('a separately hosted frontend can preflight, register, log in, and manage notes', async () => {
  const origin = 'https://candidate.netlify.app';
  const app = createApp(
    { ...env.config, NODE_ENV: 'production', APP_ORIGIN: origin },
    { logger: silentLogger },
  );
  const browser = (method, path, token) => {
    const agent = request(app);
    const call = agent[method](path)
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-CSRF-Protection', '1');
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };
  const preflight = await request(app)
    .options('/api/v1/auth/register')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection')
    .expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  const account = {
    name: 'Deployed User',
    username: 'deployed.user',
    email: 'deployed@example.com',
    password: testPassword,
  };
  const registered = await browser('post', '/api/v1/auth/register').send(account).expect(201);
  assert.equal(registered.headers['access-control-allow-origin'], origin);
  const login = await browser('post', '/api/v1/auth/login')
    .send({ username: account.username, password: testPassword })
    .expect(200);
  const token = login.body.data.accessToken;
  const created = await browser('post', '/api/v1/notes', token)
    .send({ title: 'Deployed note' })
    .expect(201);
  const path = `/api/v1/notes/${created.body.data.note._id}`;
  await browser('patch', path, token).send({ title: 'Updated note' }).expect(200);
  await browser('delete', path, token).expect(204);
  await request(app)
    .post('/api/v1/notes')
    .set('Origin', 'https://untrusted.example')
    .set('Sec-Fetch-Site', 'cross-site')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Blocked' })
    .expect(403);
});

test('note CRUD enforces ownership, and administrators can read but cannot edit other users notes', async () => {
  const created = await note();
  const id = created.body.data.note._id;
  await as('alice', 'get', `/api/v1/notes/${id}`).expect(200);
  await as('bob', 'get', `/api/v1/notes/${id}`).expect(404);
  await as('bob', 'patch', `/api/v1/notes/${id}`).send({ title: 'Stolen' }).expect(404);
  await as('bob', 'delete', `/api/v1/notes/${id}`).expect(404);
  await as('admin', 'get', `/api/v1/notes/${id}`).expect(200);
  await as('admin', 'patch', `/api/v1/notes/${id}`).send({ title: 'Changed' }).expect(404);
  const updated = await as('alice', 'patch', `/api/v1/notes/${id}`)
    .send({ title: 'Updated', content: '' })
    .expect(200);
  assert.equal(updated.body.data.note.title, 'Updated');
  await as('alice', 'patch', `/api/v1/notes/${id}`).send({ owner: users.bob.id }).expect(400);
  await as('alice', 'delete', `/api/v1/notes/${id}`).expect(204);
  await as('alice', 'get', `/api/v1/notes/${id}`).expect(404);
});

test('note listings paginate deterministically and separate own notes from admin notes', async () => {
  const ids = [];
  for (let index = 0; index < 3; index++)
    ids.push((await note('alice', `Note ${index}`)).body.data.note._id);
  await note('bob');
  await note('admin');
  const page = await as('alice', 'get', '/api/v1/notes?page=2&limit=2').expect(200);
  assert.deepEqual(
    page.body.data.map((item) => item._id),
    [ids[0]],
  );
  assert.equal(page.body.pagination.total, 3);
  assert.equal(page.body.pagination.totalPages, 2);
  const adminOwn = await as('admin', 'get', '/api/v1/notes').expect(200);
  assert.equal(adminOwn.body.pagination.total, 1);
  const everyone = await as('admin', 'get', '/api/v1/admin/notes?limit=2').expect(200);
  assert.equal(everyone.body.pagination.total, 5);
  const filtered = await as('admin', 'get', `/api/v1/admin/notes?owner=alice.reader`).expect(200);
  assert.equal(filtered.body.pagination.total, 3);
  await as('alice', 'get', '/api/v1/admin/notes').expect(403);
});

test('all list routes validate pagination and identifiers before querying', async () => {
  const paths = [
    '/api/v1/notes',
    '/api/v1/posts',
    '/api/v1/admin/users',
    '/api/v1/admin/notes',
    '/api/v1/admin/analytics/interests',
    `/api/v1/users/${users.alice.user.username}/posts`,
  ];
  for (const path of paths) {
    await as('admin', 'get', `${path}?limit=0`).expect(400);
    await as('admin', 'get', `${path}?page=100001&limit=100`).expect(400);
    await as('admin', 'get', `${path}?limit=1&limit=2`).expect(400);
  }
  await as('alice', 'get', '/api/v1/notes/not-an-id').expect(400);
  await request(env.app).get('/api/v1/users/ab/posts').expect(400);
  await as('admin', 'get', '/api/v1/admin/notes?owner[$ne]=x').expect(400);
});

test('posts are public while write access remains author-only', async () => {
  const created = await as('alice', 'post', '/api/v1/posts')
    .send({ title: 'Public', content: 'Hello everyone' })
    .expect(201);
  const id = created.body.data.post._id;
  const publicPost = await request(env.app).get(`/api/v1/posts/${id}`).expect(200);
  assert.equal(publicPost.body.data.post.author._id, users.alice.id);
  assert.equal(publicPost.body.data.post.author.username, 'alice.reader');
  const feed = await request(env.app).get('/api/v1/posts?limit=1').expect(200);
  assert.equal(feed.body.pagination.total, 1);
  await write('post', '/api/v1/posts').send({ title: 'Anonymous', content: 'No' }).expect(401);
  await as('bob', 'patch', `/api/v1/posts/${id}`).send({ title: 'No' }).expect(404);
  await as('admin', 'delete', `/api/v1/posts/${id}`).expect(404);
  await as('alice', 'patch', `/api/v1/posts/${id}`).send({ content: 'Edited' }).expect(200);
  await as('alice', 'delete', `/api/v1/posts/${id}`).expect(204);
});

test('interest grouping uses one aggregate with paginated groups and paginated users', async (t) => {
  const original = User.aggregate;
  const aggregate = t.mock.method(User, 'aggregate', function (...args) {
    return original.apply(this, args);
  });
  for (const method of ['find', 'countDocuments', 'distinct'])
    t.mock.method(User, method, () => {
      throw new Error('Extra query forbidden');
    });
  const result = await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?page=2&limit=1',
  ).expect(200);
  assert.equal(aggregate.mock.callCount(), 1);
  assert.equal(result.body.pagination.total, 2);
  assert.equal(result.body.data[0].interest, 'reading');
  assert.equal(result.body.data[0].userCount, 1);
  assert.deepEqual(result.body.data[0].users, [{ username: 'alice.reader' }]);
  const exact = await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?interest=CHESS&memberLimit=1',
  ).expect(200);
  assert.equal(exact.body.data[0].interest, 'chess');
  assert.equal(exact.body.data[0].userCount, 2);
  assert.equal(exact.body.data[0].users.length, 1);
  assert.equal(exact.body.data[0].usersPagination.hasNextPage, true);
  const next = await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?interest=chess&memberPage=2&memberLimit=1',
  ).expect(200);
  assert.equal(next.body.data[0].users.length, 1);
  assert.notEqual(next.body.data[0].users[0].username, exact.body.data[0].users[0].username);
  const beyond = await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?interest=chess&memberPage=3&memberLimit=1',
  ).expect(200);
  assert.equal(beyond.body.data[0].userCount, 2);
  assert.deepEqual(beyond.body.data[0].users, []);
  const empty = await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?interest=unknown',
  ).expect(200);
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.body.pagination.total, 0);
  await as('admin', 'get', '/api/v1/admin/analytics/interests?memberLimit=101').expect(400);
  await as(
    'admin',
    'get',
    '/api/v1/admin/analytics/interests?memberPage=100001&memberLimit=100',
  ).expect(400);
  await as('alice', 'get', '/api/v1/admin/analytics/interests').expect(403);
});

test('user posts use one aggregate and lookup with pagination, safe user fields, and empty-user behavior', async (t) => {
  const posts = await Post.create(
    Array.from({ length: 3 }, (_, index) => ({
      author: users.alice.id,
      title: `Post ${index}`,
      content: 'Text',
    })),
  );
  await Post.create({ author: users.bob.id, title: 'Other', content: 'Other' });
  const original = User.aggregate;
  const aggregate = t.mock.method(User, 'aggregate', function (...args) {
    return original.apply(this, args);
  });
  for (const method of ['find', 'findById', 'findOne', 'countDocuments'])
    t.mock.method(User, method, () => {
      throw new Error('Extra user query forbidden');
    });
  const response = await request(env.app)
    .get(`/api/v1/users/${users.alice.user.username}/posts?page=2&limit=2`)
    .expect(200);
  assert.equal(aggregate.mock.callCount(), 1);
  assert.equal(response.body.pagination.total, 3);
  const sortedIds = posts
    .map((item) => String(item._id))
    .sort()
    .reverse();
  assert.deepEqual(
    response.body.data.map((item) => item._id),
    [sortedIds[2]],
  );
  assert.deepEqual(Object.keys(response.body.user).sort(), ['username']);
  assert.deepEqual(Object.keys(response.body.data[0].author).sort(), ['_id', 'username']);
  const pipeline = aggregate.mock.calls[0].arguments[0];
  assert.equal(pipeline.filter((stage) => stage.$lookup).length, 1);
  const empty = await request(env.app)
    .get(`/api/v1/users/${users.admin.user.username}/posts`)
    .expect(200);
  assert.equal(empty.body.pagination.total, 0);
  assert.deepEqual(empty.body.data, []);
  await request(env.app).get('/api/v1/users/unknown.user/posts').expect(404);
});

test('admin user CRUD paginates, protects secrets, and invalidates sessions on update', async () => {
  await as('alice', 'get', '/api/v1/admin/users').expect(403);
  const page = await as('admin', 'get', '/api/v1/admin/users?limit=2').expect(200);
  assert.equal(page.body.data.length, 2);
  assert.equal(page.body.pagination.total, 3);
  assert.equal(JSON.stringify(page.body).includes('passwordHash'), false);
  const created = await as('admin', 'post', '/api/v1/admin/users')
    .send({
      name: 'Managed User',
      username: 'managed.user',
      email: 'managed@example.com',
      password: testPassword,
      interests: ['music'],
    })
    .expect(201);
  const id = created.body.data.user._id;
  await as('admin', 'get', `/api/v1/admin/users/${id}`).expect(200);
  const login = await write('post', '/api/v1/auth/login')
    .send({ email: 'managed@example.com', password: testPassword })
    .expect(200);
  await as('admin', 'patch', `/api/v1/admin/users/${id}`).send({ role: 'admin' }).expect(200);
  await request(env.app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${login.body.data.accessToken}`)
    .expect(401);
  await as('admin', 'patch', `/api/v1/admin/users/${id}`).send({ isActive: false }).expect(200);
  await write('post', '/api/v1/auth/login')
    .send({ email: 'managed@example.com', password: testPassword })
    .expect(401);
  await as('admin', 'delete', `/api/v1/admin/users/${id}`).expect(204);
  await as('admin', 'get', `/api/v1/admin/users/${id}`).expect(404);
});

test('user deletion cascades atomically and revokes access', async () => {
  await note('alice');
  await note('bob');
  await Post.create({ author: users.alice.id, title: 'Post', content: 'Public' });
  await as('admin', 'delete', `/api/v1/admin/users/${users.alice.id}`).expect(204);
  assert.equal(await User.findById(users.alice.id), null);
  assert.equal(await Note.countDocuments({ owner: users.alice.id }), 0);
  assert.equal(await Post.countDocuments({ author: users.alice.id }), 0);
  assert.equal(await Note.countDocuments({ owner: users.bob.id }), 1);
  await as('alice', 'get', '/api/v1/notes').expect(401);
});

test('failed cascading deletion rolls back the user and their content', async (t) => {
  await note('alice');
  t.mock.method(Post, 'deleteMany', () => {
    throw new Error('Simulated storage failure');
  });
  const response = await as('admin', 'delete', `/api/v1/admin/users/${users.alice.id}`).expect(500);
  assert.equal(response.body.error.message, 'An unexpected error occurred');
  assert.equal(JSON.stringify(response.body).includes('Simulated'), false);
  assert.ok(await User.findById(users.alice.id));
  assert.equal(await Note.countDocuments({ owner: users.alice.id }), 1);
});

test('concurrent note creation and account deletion cannot leave orphan notes', async () => {
  const [creation, deletion] = await Promise.all([
    as('alice', 'post', '/api/v1/notes').send({ title: 'Racing creation' }),
    as('admin', 'delete', `/api/v1/admin/users/${users.alice.id}`),
  ]);
  assert.ok([201, 401].includes(creation.status), `Unexpected creation status: ${creation.status}`);
  assert.equal(deletion.status, 204);
  assert.equal(await Note.countDocuments({ owner: users.alice.id }), 0);
});

test('administrators cannot delete, deactivate, or demote themselves', async () => {
  await as('admin', 'delete', `/api/v1/admin/users/${users.admin.id}`).expect(400);
  await as('admin', 'patch', `/api/v1/admin/users/${users.admin.id}`)
    .send({ role: 'user' })
    .expect(400);
  await as('admin', 'patch', `/api/v1/admin/users/${users.admin.id}`)
    .send({ isActive: false })
    .expect(400);
});

test('profile changes normalize interests and reject privilege escalation', async () => {
  const updated = await as('alice', 'patch', '/api/v1/auth/me')
    .send({ interests: [' Chess ', 'CHESS', 'music'], name: 'Alice Updated' })
    .expect(200);
  assert.deepEqual(updated.body.data.user.interests, ['chess', 'music']);
  await as('alice', 'patch', '/api/v1/auth/me').send({ role: 'admin' }).expect(400);
});

test('password change and logout invalidate old tokens while returning a new valid session', async () => {
  await as('alice', 'patch', '/api/v1/auth/password')
    .send({ currentPassword: 'wrong', newPassword: 'another-good-password' })
    .expect(400);
  const changed = await as('alice', 'patch', '/api/v1/auth/password')
    .send({ currentPassword: testPassword, newPassword: 'another-good-password' })
    .expect(200);
  await as('alice', 'get', '/api/v1/notes').expect(401);
  const token = changed.body.data.accessToken;
  await request(env.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  await write('post', '/api/v1/auth/login')
    .send({ email: 'alice@example.com', password: testPassword })
    .expect(401);
  await request(env.app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${token}`)
    .send({})
    .expect(204);
  await request(env.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
});

test('rate limits return 429 and security headers avoid caching and fingerprinting', async () => {
  const limited = createApp({ ...env.config, AUTH_RATE_LIMIT: 2 }, { logger: silentLogger });
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(limited)
      .post('/api/v1/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'missing@example.com', password: 'wrong' })
      .expect(401);
  }
  await request(limited)
    .post('/api/v1/auth/login')
    .set('X-CSRF-Protection', '1')
    .send({ email: 'missing@example.com', password: 'wrong' })
    .expect(429);
  const response = await request(env.app).get('/api/v1/posts').expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.ok(response.headers['x-request-id']);
  await request(env.app).get('/health/ready').expect(200);
  if (env.config.SERVE_FRONTEND)
    await request(env.app).get('/').expect('Content-Type', /html/).expect(200);
  else await request(env.app).get('/').expect(404);
});

test('malformed JSON, oversized bodies, and unknown routes use safe errors', async () => {
  await as('alice', 'post', '/api/v1/notes').type('json').send('{broken').expect(400);
  await as('alice', 'post', '/api/v1/notes')
    .send({ title: 'x', content: 'x'.repeat(140000) })
    .expect(413);
  const missing = await request(env.app).get('/api/v1/missing').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
  assert.equal(missing.body.error.stack, undefined);
});

test('legacy interest index is retired after the compound replacement exists', async () => {
  await User.collection.createIndex({ interests: 1 }, { name: 'users_interests' });
  await retireLegacyInterestIndex();
  const indexes = await User.collection.indexes();
  assert.equal(
    indexes.some((index) => index.name === 'users_interests'),
    false,
  );
  assert.ok(indexes.some((index) => index.name === 'users_interests_id'));
});

test('only the five required schema indexes exist, and explain shows indexes supporting the query shapes', async () => {
  for (const [Model, names] of [
    [User, ['_id_', 'users_email_unique', 'users_username_unique', 'users_interests_id']],
    [Note, ['_id_', 'notes_owner_id']],
    [Post, ['_id_', 'posts_author_id']],
  ])
    assert.deepEqual(
      (await Model.collection.indexes()).map((item) => item.name).sort(),
      names.sort(),
    );
  await note();
  await Post.create({ author: users.alice.id, title: 'Indexed post', content: 'Text' });
  const notesPlan = await Note.find({ owner: users.alice.id })
    .sort({ _id: -1 })
    .limit(10)
    .explain('executionStats');
  assert.ok(JSON.stringify(notesPlan.queryPlanner.winningPlan).includes('notes_owner_id'));
  const usersPlan = await User.find({}).sort({ _id: -1 }).limit(10).explain('executionStats');
  assert.ok(JSON.stringify(usersPlan.queryPlanner.winningPlan).includes('_id_'));
  const interestPlan = await User.aggregate(
    interestsPipeline({ page: 1, limit: 10, interest: 'reading' }),
  ).explain('executionStats');
  assert.ok(JSON.stringify(interestPlan).includes('users_interests_id'));
  const lookupPlan = await User.aggregate(
    userPostsPipeline(users.alice.user.username, { page: 1, limit: 10 }),
  ).explain('executionStats');
  assert.ok(JSON.stringify(lookupPlan).includes('posts_author_id'));
});

test('documentation-origin writes preserve login, bearer authorization, and CSRF checks', async () => {
  const origin = 'https://api.example.com';
  const app = createApp(
    {
      ...env.config,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://frontend.example.com',
      API_ORIGIN: origin,
    },
    { logger: silentLogger },
  );
  await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ username: users.alice.user.username, password: testPassword })
    .expect(403);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('Sec-Fetch-Site', 'same-origin')
    .set('X-CSRF-Protection', '1')
    .send({ username: users.alice.user.username, password: testPassword })
    .expect(200);
  const token = login.body.data.accessToken;
  await request(app)
    .post('/api/v1/notes')
    .set('Origin', origin)
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Protection', '1')
    .send({ title: 'Created through documentation' })
    .expect(201);
  await request(app)
    .post('/api/v1/notes')
    .set('Origin', 'https://evil.example')
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Protection', '1')
    .send({ title: 'Blocked' })
    .expect(403);
});

test('legacy API redirects preserve queries, methods, authentication, and request bodies', async () => {
  const redirect = await request(env.app).get('/api/posts?page=2&limit=1').expect(308);
  assert.equal(redirect.headers.location, '/api/v1/posts?page=2&limit=1');
  assert.equal(redirect.headers['cache-control'], 'no-store');
  await request(env.app).get('/api/notes').redirects(1).expect(401);
  for (const path of ['/api/auth/login', '/api/v1/auth/login']) {
    const preflight = await request(env.app)
      .options(path)
      .set('Origin', env.config.APP_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection')
      .expect(204);
    assert.equal(preflight.headers['access-control-allow-origin'], env.config.APP_ORIGIN);
  }
  const login = await request(env.app)
    .post('/api/auth/login')
    .set('Origin', env.config.APP_ORIGIN)
    .set('X-CSRF-Protection', '1')
    .send({ username: users.alice.user.username, password: testPassword })
    .redirects(1)
    .expect(200);
  const token = login.body.data.accessToken;
  const created = await request(env.app)
    .post('/api/notes')
    .set('Origin', env.config.APP_ORIGIN)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Legacy client note', content: 'Body survives the redirect' })
    .redirects(1)
    .expect(201);
  assert.equal(created.body.data.note.content, 'Body survives the redirect');
  const path = `/api/notes/${created.body.data.note._id}`;
  const updated = await request(env.app)
    .patch(path)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Updated through legacy URL' })
    .redirects(1)
    .expect(200);
  assert.equal(updated.body.data.note.title, 'Updated through legacy URL');
  await request(env.app)
    .delete(path)
    .set('Authorization', `Bearer ${token}`)
    .redirects(1)
    .expect(204);
});

test('unsupported API versions are rejected instead of falling back to v1', async () => {
  await request(env.app).get('/api/v1/posts').expect(200);
  await request(env.app).get('/api/v1/notes').expect(401);
  for (const path of ['/api/v2/posts', '/api/v10/posts', '/api/v1/v1/posts', '/api/unknown']) {
    const response = await request(env.app).get(path).expect(404);
    assert.equal(response.headers.location, undefined);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  }
});
