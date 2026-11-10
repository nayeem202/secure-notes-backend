import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { accountWrite } from '../services/account-write.js';
import { createUser } from '../services/users.js';
import { ApiError } from '../utils/api-error.js';
import { serializeUser } from '../utils/serialize.js';
import { clearSession, setSession } from '../utils/tokens.js';

export function authController(config) {
  const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS);
  const sessionResponse = (res, user, status = 200) => {
    const session = setSession(res, user, config);
    return res.status(status).json({ data: { user: serializeUser(user), ...session } });
  };

  return {
    register: async (req, res) => {
      const user = await createUser({ ...req.validated.body, role: 'user' }, config);
      sessionResponse(res, user, 201);
    },
    login: async (req, res) => {
      const input = req.validated.body;
      const user = await User.findOne(input.email ? { email: input.email } : { username: input.username })
        .select('+passwordHash +tokenVersion');
      const fits = Buffer.byteLength(input.password, 'utf8') <= 72;
      const hash = user && fits ? user.passwordHash : await dummyHash;
      const matches = await bcrypt.compare(input.password, hash);
      if (!matches || !fits || !user?.isActive) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email, username, or password');
      }
      sessionResponse(res, user);
    },
    me: (req, res) => res.json({ data: { user: serializeUser(req.user) } }),
    updateProfile: async (req, res) => {
      const user = await accountWrite(req.user, session => User.findByIdAndUpdate(req.user._id,
        { $set: req.validated.body }, { session, new: true, runValidators: true }));
      res.json({ data: { user: serializeUser(user) } });
    },
    changePassword: async (req, res) => {
      const { currentPassword, newPassword } = req.validated.body;
      const current = await User.findById(req.user._id).select('+passwordHash');
      if (!current || Buffer.byteLength(currentPassword, 'utf8') > 72 ||
          !await bcrypt.compare(currentPassword, current.passwordHash)) {
        throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
      }
      const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
      const user = await accountWrite(req.user, session => User.findByIdAndUpdate(req.user._id,
        { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
        { session, new: true, runValidators: true }).select('+tokenVersion'));
      sessionResponse(res, user);
    },
    logout: async (req, res) => {
      await accountWrite(req.user, session => User.updateOne({ _id: req.user._id },
        { $inc: { tokenVersion: 1 } }, { session }));
      clearSession(res, config);
      res.status(204).end();
    },
  };
}
