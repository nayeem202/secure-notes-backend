import { User } from '../models/User.js';
import { Note } from '../models/Note.js';
import { Post } from '../models/Post.js';
import { accountWrite } from '../services/account-write.js';
import { buildUser } from '../services/users.js';
import { ApiError } from '../utils/api-error.js';
import { listPage } from '../utils/pagination.js';
import { serializeUser, USER_FIELDS } from '../utils/serialize.js';
import { setSession } from '../utils/tokens.js';
import bcrypt from 'bcrypt';

export const listUsers = async (req, res) => {
  res.json(await listPage(User, {}, req.validated.query, { select: USER_FIELDS, hint: '_id_' }));
};

export const getUser = async (req, res) => {
  const user = await User.findById(req.validated.params.id).select(USER_FIELDS).lean();
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  res.json({ data: { user } });
};

export const createUser = config => async (req, res) => {
  const fields = await buildUser(req.validated.body, config);
  const user = await accountWrite(req.user, async session => {
    const [created] = await User.create([fields], { session });
    return created;
  });
  res.status(201).json({ data: { user: serializeUser(user) } });
};

export const updateUser = config => async (req, res) => {
  const input = req.validated.body;
  const isSelf = String(req.user._id) === req.validated.params.id.toLowerCase();
  if (isSelf && (input.role === 'user' || input.isActive === false)) {
    throw new ApiError(400, 'SELF_PROTECTION', 'Administrators cannot demote or deactivate their own account');
  }
  const { password, ...fields } = input;
  if (password !== undefined) fields.passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  const user = await accountWrite(req.user, session => User.findByIdAndUpdate(req.validated.params.id,
    { $set: fields, $inc: { tokenVersion: 1 } }, { session, new: true, runValidators: true }).select('+tokenVersion'));
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const session = isSelf ? setSession(res, user, config) : {};
  res.json({ data: { user: serializeUser(user), ...session } });
};

export const deleteUser = async (req, res) => {
  const id = req.validated.params.id;
  if (String(req.user._id) === id.toLowerCase()) {
    throw new ApiError(400, 'SELF_PROTECTION', 'Administrators cannot delete their own account');
  }
  await accountWrite(req.user, async session => {
    const user = await User.findByIdAndDelete(id, { session });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    // Sequential operations within a transaction are intentional.
    await Note.deleteMany({ owner: user._id }, { session });
    await Post.deleteMany({ author: user._id }, { session });
  });
  res.status(204).end();
};
