import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ApiError } from '../utils/api-error.js';

export function accountWrite(actor, work) {
  return mongoose.connection.transaction(async session => {
    // A real write to the parent account prevents create-vs-delete write skew.
    // Retried transactions recheck both account existence and session version.
    const guard = await User.updateOne({
      _id: actor._id, isActive: true, tokenVersion: actor.tokenVersion, role: actor.role,
    }, { $inc: { writeVersion: 1 } }, { session, timestamps: false });
    if (guard.matchedCount !== 1) throw new ApiError(401, 'UNAUTHORIZED', 'Session is invalid or expired');
    return work(session);
  }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 });
}
