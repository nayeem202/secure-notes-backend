import { ApplicationError } from '../domain/application-error.js';
import { isSameUser, protectAdministrator, requireAdmin } from '../domain/policies.js';
import { prepareUser } from './prepare-user.js';
import { serializeUser } from './serializers.js';

const requireUser = user => {
  if (!user) throw new ApplicationError('NOT_FOUND', 'User not found');
  return user;
};

export function createUserUseCases({ repositories, accountWrite, passwords, tokens }) {
  return {
    list(actor, query) {
      requireAdmin(actor);
      return repositories.users.list(query);
    },
    async get(actor, id) {
      requireAdmin(actor);
      return serializeUser(requireUser(await repositories.users.findById(id)));
    },
    async create(actor, input) {
      requireAdmin(actor);
      const fields = await prepareUser(input, passwords);
      const user = await accountWrite(actor, scoped => scoped.users.insert(fields));
      return serializeUser(user);
    },
    async update(actor, id, input) {
      requireAdmin(actor);
      protectAdministrator(actor, id, input);
      const { password, ...changes } = input;
      if (password !== undefined) changes.passwordHash = await passwords.hash(password);
      const user = requireUser(await accountWrite(actor, scoped => scoped.users.update(id, changes, { invalidateSessions: true })));
      return {
        user: serializeUser(user),
        ...(isSameUser(actor, id) ? { accessToken: tokens.issue(user), expiresIn: tokens.expiresIn } : {}),
      };
    },
    async remove(actor, id) {
      requireAdmin(actor);
      if (isSameUser(actor, id)) {
        throw new ApplicationError('SELF_PROTECTION', 'Administrators cannot delete their own account');
      }
      await accountWrite(actor, async scoped => {
        const user = requireUser(await scoped.users.remove(id));
        await scoped.notes.removeForOwner(user._id);
        await scoped.posts.removeForAuthor(user._id);
      });
    },
    async bootstrapAdmin(input) {
      const existing = await repositories.users.findByEmail(input.email);
      if (existing) {
        if (existing.role !== 'admin' || !existing.isActive || existing.username !== input.username) {
          throw new ApplicationError('CONFLICT', 'That email belongs to another account; use the admin API to manage it');
        }
        return { user: serializeUser(existing), created: false };
      }
      if (await repositories.users.findByUsername(input.username)) {
        throw new ApplicationError('CONFLICT', 'That username is already taken');
      }
      const fields = await prepareUser({ ...input, role: 'admin' }, passwords);
      return { user: serializeUser(await repositories.users.insert(fields)), created: true };
    },
  };
}
