import { pagination } from '../utils/pagination.js';

export function interestsPipeline(query) {
  const { skip, limit } = pagination(query);
  const { interest } = query;
  return [
    // Exact-interest queries use the multikey index; global grouping must read
    // all nonempty interest arrays. An index cannot eliminate that work.
    { $match: { interests: interest ?? { $gt: '' } } },
    { $project: { _id: 0, interests: 1 } },
    { $unwind: '$interests' },
    ...(interest ? [{ $match: { interests: interest } }] : []),
    { $group: { _id: '$interests', userCount: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $facet: {
      data: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 0, interest: '$_id', userCount: 1 } }],
      metadata: [{ $count: 'total' }],
    } },
  ];
}

export function userPostsPipeline(username, query) {
  const { skip, limit } = pagination(query);
  return [
    { $match: { username } },
    { $project: { _id: 1, username: 1, name: 1, interests: 1 } },
    { $lookup: {
      from: 'posts',
      let: { userId: '$_id', username: '$username' },
      pipeline: [
        { $match: { $expr: { $eq: ['$author', '$$userId'] } } },
        { $sort: { _id: -1 } },
        // Match + sort precede $facet so posts_author_id can support both.
        { $facet: {
          data: [
            { $skip: skip }, { $limit: limit },
            { $addFields: { author: { _id: '$author', username: '$$username' } } },
            { $project: { _id: 1, author: 1, title: 1, content: 1, createdAt: 1, updatedAt: 1 } },
          ],
          metadata: [{ $count: 'total' }],
        } },
      ],
      as: 'postPage',
    } },
    { $project: { _id: 0, username: 1, name: 1, interests: 1, postPage: 1 } },
  ];
}
