import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountWriter } from '../src/application/account-write.js';
import { createAuthUseCases } from '../src/application/auth.js';
import { createNoteUseCases } from '../src/application/notes.js';
import { createUserUseCases } from '../src/application/users.js';
import { createAnalyticsUseCases } from '../src/application/analytics.js';

const actor = { _id: 'user-1', role: 'user', tokenVersion: 2 };
const admin = { _id: 'admin-1', role: 'admin', tokenVersion: 3 };

test('note read use case scopes users to their own notes and permits admin reads', async () => {
  const calls = [];
  const notes = createNoteUseCases({
    repositories: {
      notes: {
        find: async (id, owner) => {
          calls.push({ id, owner });
          return { _id: id };
        },
      },
    },
  });
  await notes.get(actor, 'note-1');
  await notes.get(admin, 'note-1');
  assert.deepEqual(calls, [
    { id: 'note-1', owner: actor._id },
    { id: 'note-1', owner: undefined },
  ]);
  await assert.rejects(notes.get(null, 'note-1'), { code: 'UNAUTHORIZED' });
});

test('admin list use cases reject a normal user before touching persistence', () => {
  const repositories = {
    users: {
      list() {
        throw new Error('Persistence must not run');
      },
    },
  };
  const users = createUserUseCases({ repositories });
  assert.throws(() => users.list(actor, { page: 1, limit: 10 }), { code: 'FORBIDDEN' });
});

test('administrator self protection is enforced inside application use cases', async () => {
  const users = createUserUseCases({});
  await assert.rejects(users.remove(admin, admin._id), { code: 'SELF_PROTECTION' });
  await assert.rejects(users.update(admin, admin._id, { role: 'user' }), {
    code: 'SELF_PROTECTION',
  });
  await assert.rejects(users.update(admin, admin._id, { isActive: false }), {
    code: 'SELF_PROTECTION',
  });
});

test('transaction writer rejects stale sessions before running content changes', async () => {
  let changed = false;
  const write = createAccountWriter({
    run: (work) => work({ users: { lockActive: async () => false } }),
  });
  await assert.rejects(
    write(actor, () => {
      changed = true;
    }),
    { code: 'UNAUTHORIZED' },
  );
  assert.equal(changed, false);
});

test('authentication use case reads current account state and rejects revoked sessions', async () => {
  const auth = createAuthUseCases({
    repositories: { users: { findSessionUser: async () => ({ ...actor, isActive: true }) } },
    tokens: { verify: () => ({ sub: actor._id, ver: actor.tokenVersion - 1 }) },
  });
  await assert.rejects(auth.authenticate('old-token'), { code: 'UNAUTHORIZED' });
});

test('public user-post use case excludes profile fields while preserving pagination', async () => {
  let calls = 0;
  const analytics = createAnalyticsUseCases({
    repositories: {
      reports: {
        userPosts: async () => {
          calls++;
          return [
            {
              username: 'reader',
              name: 'Private name',
              email: 'private@example.com',
              interests: ['private'],
              postPage: [
                { data: [{ _id: 'post-1', title: 'Public post' }], metadata: [{ total: 1 }] },
              ],
            },
          ];
        },
      },
    },
  });
  const result = await analytics.postsByUser('reader', { page: 1, limit: 10 });
  assert.equal(calls, 1);
  assert.deepEqual(result.user, { username: 'reader' });
  assert.equal(result.data[0].title, 'Public post');
  assert.equal(result.pagination.total, 1);
});
