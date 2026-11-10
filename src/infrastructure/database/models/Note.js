import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, default: '', maxlength: 20000 },
  },
  { timestamps: true, strict: 'throw', versionKey: false },
);

noteSchema.index({ owner: 1, _id: -1 }, { name: 'notes_owner_id' });

export const Note = mongoose.model('Note', noteSchema);
