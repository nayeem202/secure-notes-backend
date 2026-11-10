import '../src/config/load-env.js';
import { loadConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';
import { interestsPipeline, userPostsPipeline } from '../src/services/aggregation-pipelines.js';

try {
  await connectDatabase({ ...loadConfig(), AUTO_INDEX: false });
  const user = await User.findOne().select('username').lean();
  if (!user) throw new Error('Create at least one user and some notes/posts before explaining queries');
  const plans = {
    adminUsers: await User.find({}).sort({ _id: -1 }).limit(10).explain('executionStats'),
    ownNotes: await Note.find({ owner: user._id }).sort({ _id: -1 }).limit(10).explain('executionStats'),
    allNotes: await Note.find({}).sort({ _id: -1 }).limit(10).explain('executionStats'),
    publicPosts: await Post.find({}).sort({ _id: -1 }).limit(10).explain('executionStats'),
    filteredInterests: await User.aggregate(interestsPipeline({ page: 1, limit: 10, interest: 'chess' })).explain('executionStats'),
    userPostsLookup: await User.aggregate(userPostsPipeline(user.username, { page: 1, limit: 10 })).explain('executionStats'),
  };
  console.log(JSON.stringify(plans, null, 2));
} catch (error) {
  console.error('Explain failed. Seed some data and check database access.', error.name, error.code ?? '');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
