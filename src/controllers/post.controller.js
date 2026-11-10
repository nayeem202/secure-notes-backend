import { Post } from '../models/Post.js';
import { accountWrite } from '../services/account-write.js';
import { ApiError } from '../utils/api-error.js';
import { listPage } from '../utils/pagination.js';

const missing = () => new ApiError(404, 'NOT_FOUND', 'Post not found');

export const listPosts = async (req, res) => {
  res.json(await listPage(Post, {}, req.validated.query, {
    hint: '_id_', populate: { path: 'author', select: 'username' },
  }));
};

export const getPost = async (req, res) => {
  const post = await Post.findById(req.validated.params.id).populate('author', 'username').lean();
  if (!post) throw missing();
  res.json({ data: { post } });
};

export const createPost = async (req, res) => {
  const post = await accountWrite(req.user, async session => {
    const [created] = await Post.create([{ ...req.validated.body, author: req.user._id }], { session });
    return created.populate('author', 'username');
  });
  res.status(201).json({ data: { post } });
};

export const updatePost = async (req, res) => {
  const post = await accountWrite(req.user, session => Post.findOneAndUpdate(
    { _id: req.validated.params.id, author: req.user._id }, { $set: req.validated.body },
    { session, new: true, runValidators: true }).populate('author', 'username'));
  if (!post) throw missing();
  res.json({ data: { post } });
};

export const deletePost = async (req, res) => {
  const post = await accountWrite(req.user, session => Post.findOneAndDelete(
    { _id: req.validated.params.id, author: req.user._id }, { session }));
  if (!post) throw missing();
  res.status(204).end();
};
