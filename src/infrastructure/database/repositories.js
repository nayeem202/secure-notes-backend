import { User } from './models/User.js';
import { Note } from './models/Note.js';
import { Post } from './models/Post.js';
import { USER_FIELDS } from '../../application/serializers.js';
import { interestsPipeline, userPostsPipeline } from './aggregation-pipelines.js';
import { listPage } from './list-page.js';
import { toRecord } from './records.js';
import { persistenceError } from './errors.js';

export function createRepositories({ session, queryTimeoutMs = 10000 } = {}) {
  const options = session ? { session } : {};
  const scoped = (query) => (session ? query.session(session) : query);
  const read = async (query) => toRecord(await scoped(query).lean());
  const updateOptions = { ...options, returnDocument: 'after', runValidators: true };

  const repositories = {
    users: {
      list: (query) => listPage(User, {}, query, { select: USER_FIELDS, hint: '_id_', session }),
      findById: (id) => read(User.findById(id).select(USER_FIELDS)),
      findByEmail: (email) => read(User.findOne({ email })),
      findByUsername: (username) => read(User.findOne({ username })),
      findCredentials: (identity) =>
        read(User.findOne(identity).select('+passwordHash +tokenVersion')),
      findSessionUser: (id) => read(User.findById(id).select('+tokenVersion')),
      findPassword: (id) => read(User.findById(id).select('+passwordHash')),
      async insert(fields) {
        const [user] = await User.create([fields], options);
        return toRecord(user);
      },
      async lockActive(actor) {
        const result = await User.updateOne(
          {
            _id: actor._id,
            isActive: true,
            tokenVersion: actor.tokenVersion,
            role: actor.role,
          },
          { $inc: { writeVersion: 1 } },
          { ...options, timestamps: false },
        );
        return result.matchedCount === 1;
      },
      update(id, fields, { invalidateSessions = false } = {}) {
        return read(
          User.findByIdAndUpdate(
            id,
            {
              $set: fields,
              ...(invalidateSessions ? { $inc: { tokenVersion: 1 } } : {}),
            },
            updateOptions,
          ).select('+tokenVersion'),
        );
      },
      revokeSessions: (id) => User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } }, options),
      remove: (id) => read(User.findByIdAndDelete(id, options)),
    },
    notes: {
      list: (filter, query) =>
        listPage(Note, filter, query, {
          hint: filter.owner ? 'notes_owner_id' : '_id_',
          populate: { path: 'owner', select: 'username' },
          session,
        }),
      find(id, owner) {
        return read(
          Note.findOne({ _id: id, ...(owner ? { owner } : {}) }).populate('owner', 'username'),
        );
      },
      async insert(fields) {
        const [note] = await Note.create([fields], options);
        return toRecord(await note.populate('owner', 'username'));
      },
      updateOwned: (id, owner, fields) =>
        read(
          Note.findOneAndUpdate({ _id: id, owner }, { $set: fields }, updateOptions).populate(
            'owner',
            'username',
          ),
        ),
      removeOwned: (id, owner) => read(Note.findOneAndDelete({ _id: id, owner }, options)),
      removeForOwner: (owner) => Note.deleteMany({ owner }, options),
    },
    posts: {
      list: (query) =>
        listPage(Post, {}, query, {
          hint: '_id_',
          populate: { path: 'author', select: 'username' },
          session,
        }),
      find: (id) => read(Post.findById(id).populate('author', 'username')),
      async insert(fields) {
        const [post] = await Post.create([fields], options);
        return toRecord(await post.populate('author', 'username'));
      },
      updateOwned: (id, author, fields) =>
        read(
          Post.findOneAndUpdate({ _id: id, author }, { $set: fields }, updateOptions).populate(
            'author',
            'username',
          ),
        ),
      removeOwned: (id, author) => read(Post.findOneAndDelete({ _id: id, author }, options)),
      removeForAuthor: (author) => Post.deleteMany({ author }, options),
    },
    reports: {
      async interests(query) {
        return toRecord(
          await User.aggregate(interestsPipeline(query))
            .allowDiskUse(true)
            .option({ maxTimeMS: queryTimeoutMs }),
        );
      },
      async userPosts(username, query) {
        return toRecord(
          await User.aggregate(userPostsPipeline(username, query)).option({
            maxTimeMS: queryTimeoutMs,
          }),
        );
      },
    },
  };
  return Object.fromEntries(
    Object.entries(repositories).map(([name, repository]) => [
      name,
      Object.fromEntries(
        Object.entries(repository).map(([operation, execute]) => [
          operation,
          async (...args) => {
            try {
              return await execute(...args);
            } catch (error) {
              throw session ? error : persistenceError(error);
            }
          },
        ]),
      ),
    ]),
  );
}
