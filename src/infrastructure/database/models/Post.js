import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  content: { type: String, required: true, maxlength: 20000 },
}, { timestamps: true, strict: 'throw', versionKey: false });

postSchema.index({ author: 1, _id: -1 }, { name: 'posts_author_id' });

export const Post = mongoose.model('Post', postSchema);
