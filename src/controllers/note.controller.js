import { Note } from '../models/Note.js';
import { User } from '../models/User.js';
import { accountWrite } from '../services/account-write.js';
import { ApiError } from '../utils/api-error.js';
import { listPage, pageInfo } from '../utils/pagination.js';

const missing = () => new ApiError(404, 'NOT_FOUND', 'Note not found');

export const listNotes = async (req, res) => {
  res.json(await listPage(Note, { owner: req.user._id }, req.validated.query, {
    populate: { path: 'owner', select: 'username' },
  }));
};

export const listAllNotes = async (req, res) => {
  const { owner: username } = req.validated.query;
  const owner = username ? await User.findOne({ username }).select('_id').lean() : null;
  if (username && !owner) return res.json({ data: [], pagination: pageInfo(0, req.validated.query) });
  res.json(await listPage(Note, owner ? { owner: owner._id } : {}, req.validated.query, {
    hint: owner ? 'notes_owner_id' : '_id_', populate: { path: 'owner', select: 'username' },
  }));
};

export const getNote = async (req, res) => {
  const filter = { _id: req.validated.params.id };
  if (req.user.role !== 'admin') filter.owner = req.user._id;
  const note = await Note.findOne(filter).populate('owner', 'username').lean();
  if (!note) throw missing();
  res.json({ data: { note } });
};

export const createNote = async (req, res) => {
  const note = await accountWrite(req.user, async session => {
    const [created] = await Note.create([{ ...req.validated.body, owner: req.user._id }], { session });
    return created.populate('owner', 'username');
  });
  res.status(201).json({ data: { note } });
};

export const updateNote = async (req, res) => {
  const note = await accountWrite(req.user, session => Note.findOneAndUpdate(
    { _id: req.validated.params.id, owner: req.user._id }, { $set: req.validated.body },
    { session, new: true, runValidators: true }).populate('owner', 'username'));
  if (!note) throw missing();
  res.json({ data: { note } });
};

export const deleteNote = async (req, res) => {
  const note = await accountWrite(req.user, session => Note.findOneAndDelete(
    { _id: req.validated.params.id, owner: req.user._id }, { session }));
  if (!note) throw missing();
  res.status(204).end();
};
