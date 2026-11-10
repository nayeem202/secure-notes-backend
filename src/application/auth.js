import { ApplicationError } from '../domain/application-error.js';
import { requireActor } from '../domain/policies.js';
import { prepareUser } from './prepare-user.js';
import { serializeUser } from './serializers.js';

const fitsPasswordLimit = (value) => new TextEncoder().encode(value).byteLength <= 72;

export function createAuthUseCases({ repositories, passwords, tokens, accountWrite }) {
  const sessionFor = (user) => ({
    user: serializeUser(user),
    accessToken: tokens.issue(user),
    expiresIn: tokens.expiresIn,
  });

  return {
    async register(input) {
      const fields = await prepareUser({ ...input, role: 'user' }, passwords);
      return sessionFor(await repositories.users.insert(fields));
    },
    async login(input) {
      const identity = input.email ? { email: input.email } : { username: input.username };
      const user = await repositories.users.findCredentials(identity);
      const fits = fitsPasswordLimit(input.password);
      const hash = user && fits ? user.passwordHash : await passwords.dummyHash;
      const matches = await passwords.compare(input.password, hash);
      if (!matches || !fits || !user?.isActive) {
        throw new ApplicationError('INVALID_CREDENTIALS', 'Invalid email, username, or password');
      }
      return sessionFor(user);
    },
    async authenticate(token) {
      if (!token) throw new ApplicationError('UNAUTHORIZED', 'Sign in to continue');
      let payload;
      try {
        payload = tokens.verify(token);
      } catch {
        throw new ApplicationError('UNAUTHORIZED', 'Session is invalid or expired');
      }
      const user = await repositories.users.findSessionUser(payload.sub);
      if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
        throw new ApplicationError('UNAUTHORIZED', 'Session is invalid or expired');
      }
      return user;
    },
    profile(actor) {
      requireActor(actor);
      return serializeUser(actor);
    },
    async updateProfile(actor, changes) {
      const user = await accountWrite(actor, (scoped) => scoped.users.update(actor._id, changes));
      return serializeUser(user);
    },
    async changePassword(actor, { currentPassword, newPassword }) {
      requireActor(actor);
      const current = await repositories.users.findPassword(actor._id);
      if (
        !current ||
        !fitsPasswordLimit(currentPassword) ||
        !(await passwords.compare(currentPassword, current.passwordHash))
      ) {
        throw new ApplicationError('INVALID_PASSWORD', 'Current password is incorrect');
      }
      const passwordHash = await passwords.hash(newPassword);
      const user = await accountWrite(actor, (scoped) =>
        scoped.users.update(actor._id, { passwordHash }, { invalidateSessions: true }),
      );
      return sessionFor(user);
    },
    async logout(actor) {
      await accountWrite(actor, (scoped) => scoped.users.revokeSessions(actor._id));
    },
  };
}
