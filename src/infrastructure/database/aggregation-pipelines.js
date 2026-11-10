import { pagination } from '../../domain/pagination.js';

export function interestsPipeline(query) {
  const { skip, limit } = pagination(query);
  const { interest } = query;
  const members = pagination({ page: query.memberPage ?? 1, limit: query.memberLimit ?? 10 });
  return [
    { $match: { interests: interest ?? { $gt: '' } } },
    { $project: { _id: 0, interests: 1 } },
    { $unwind: '$interests' },
    ...(interest ? [{ $match: { interests: interest } }] : []),
    { $group: { _id: '$interests', userCount: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: 'interests',
              pipeline: [
                { $sort: { _id: 1 } },
                { $skip: members.skip },
                { $limit: members.limit },
                { $project: { _id: 0, username: 1 } },
              ],
              as: 'users',
            },
          },
          { $project: { _id: 0, interest: '$_id', userCount: 1, users: 1 } },
        ],
        metadata: [{ $count: 'total' }],
      },
    },
  ];
}

export function userPostsPipeline(username, query) {
  const { skip, limit } = pagination(query);
  return [
    { $match: { username } },
    { $project: { _id: 1, username: 1 } },
    {
      $lookup: {
        from: 'posts',
        let: { userId: '$_id', username: '$username' },
        pipeline: [
          { $match: { $expr: { $eq: ['$author', '$$userId'] } } },
          { $sort: { _id: -1 } },

          {
            $facet: {
              data: [
                { $skip: skip },
                { $limit: limit },
                { $addFields: { author: { _id: '$author', username: '$$username' } } },
                {
                  $project: { _id: 1, author: 1, title: 1, content: 1, createdAt: 1, updatedAt: 1 },
                },
              ],
              metadata: [{ $count: 'total' }],
            },
          },
        ],
        as: 'postPage',
      },
    },
    { $project: { _id: 0, username: 1, postPage: 1 } },
  ];
}
