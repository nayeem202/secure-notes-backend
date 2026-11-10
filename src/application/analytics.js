import { ApplicationError } from '../domain/application-error.js';
import { requireAdmin } from '../domain/policies.js';
import { pageInfo } from '../domain/pagination.js';

export function createAnalyticsUseCases({ repositories }) {
  return {
    async groupByInterests(actor, query) {
      requireAdmin(actor);
      const [result] = await repositories.reports.interests(query);
      return {
        data: result.data.map(group => ({
          ...group,
          usersPagination: pageInfo(group.userCount, {
            page: query.memberPage ?? 1, limit: query.memberLimit ?? 10,
          }),
        })),
        pagination: pageInfo(result.metadata[0]?.total ?? 0, query),
      };
    },
    async postsByUser(username, query) {
      const [result] = await repositories.reports.userPosts(username, query);
      if (!result) throw new ApplicationError('NOT_FOUND', 'User not found');
      const posts = result.postPage[0] ?? { data: [], metadata: [] };
      return {
        user: { username: result.username },
        data: posts.data,
        pagination: pageInfo(posts.metadata[0]?.total ?? 0, query),
      };
    },
  };
}
