import { User } from '../models/User.js';
import { interestsPipeline, userPostsPipeline } from '../services/aggregation-pipelines.js';
import { ApiError } from '../utils/api-error.js';
import { pageInfo } from '../utils/pagination.js';

export const groupByInterests = config => async (req, res) => {
  // EXACTLY ONE User.aggregate call; no find/count/distinct/populate or second
  // aggregation. $facet computes the page and its total in this same pipeline.
  const [result] = await User.aggregate(interestsPipeline(req.validated.query))
    .allowDiskUse(true).option({ maxTimeMS: config.QUERY_TIMEOUT_MS });
  res.json({ data: result.data, pagination: pageInfo(result.metadata[0]?.total ?? 0, req.validated.query) });
};

export const getUserPosts = config => async (req, res) => {
  // One pipeline: indexed user match followed by an indexed, bounded $lookup.
  const [result] = await User.aggregate(userPostsPipeline(req.validated.params.username, req.validated.query))
    .option({ maxTimeMS: config.QUERY_TIMEOUT_MS });
  if (!result) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const postPage = result.postPage[0] ?? { data: [], metadata: [] };
  res.json({
    user: { username: result.username, name: result.name, interests: result.interests },
    data: postPage.data,
    pagination: pageInfo(postPage.metadata[0]?.total ?? 0, req.validated.query),
  });
};
