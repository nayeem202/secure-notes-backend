import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  username: {
    type: String, required: true, trim: true, lowercase: true,
    minlength: 3, maxlength: 30, match: /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/,
  },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
  interests: {
    type: [{ type: String, trim: true, lowercase: true, minlength: 1, maxlength: 40 }],
    default: [],
    validate: value => value.length <= 20 && new Set(value).size === value.length,
  },
  isActive: { type: Boolean, default: true, required: true },
  tokenVersion: { type: Number, default: 0, select: false },
  // A transactional write guard serializes content creation with account deletion.
  writeVersion: { type: Number, default: 0, select: false },
}, { timestamps: true, strict: 'throw' });

userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({ username: 1 }, { unique: true, name: 'users_username_unique' });
userSchema.index({ interests: 1 }, { name: 'users_interests' });
// The automatic _id index serves user GETs and admin listing sorted by _id.

export const User = mongoose.model('User', userSchema);
