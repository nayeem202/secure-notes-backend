import { ApplicationError } from '../domain/application-error.js';

const requirePost = (post) => {
  if (!post) throw new ApplicationError('NOT_FOUND', 'Post not found');
  return post;
};

export function createPostUseCases({ repositories, accountWrite }) {
  return {
    list(query) {
      return repositories.posts.list(query);
    },
    async get(id) {
      return requirePost(await repositories.posts.find(id));
    },
    create(actor, input) {
      return accountWrite(actor, (scoped) => scoped.posts.insert({ ...input, author: actor._id }));
    },
    async update(actor, id, input) {
      return requirePost(
        await accountWrite(actor, (scoped) => scoped.posts.updateOwned(id, actor._id, input)),
      );
    },
    async remove(actor, id) {
      requirePost(await accountWrite(actor, (scoped) => scoped.posts.removeOwned(id, actor._id)));
    },
  };
}
