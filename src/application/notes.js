import { ApplicationError } from '../domain/application-error.js';
import { requireActor, requireAdmin } from '../domain/policies.js';
import { pageInfo } from '../domain/pagination.js';

const requireNote = note => {
  if (!note) throw new ApplicationError('NOT_FOUND', 'Note not found');
  return note;
};

export function createNoteUseCases({ repositories, accountWrite }) {
  return {
    listOwn(actor, query) {
      requireActor(actor);
      return repositories.notes.list({ owner: actor._id }, query);
    },
    async listAll(actor, query) {
      requireAdmin(actor);
      const owner = query.owner ? await repositories.users.findByUsername(query.owner) : null;
      if (query.owner && !owner) return { data: [], pagination: pageInfo(0, query) };
      return repositories.notes.list(owner ? { owner: owner._id } : {}, query);
    },
    async get(actor, id) {
      requireActor(actor);
      return requireNote(await repositories.notes.find(id, actor.role === 'admin' ? undefined : actor._id));
    },
    create(actor, input) {
      return accountWrite(actor, scoped => scoped.notes.insert({ ...input, owner: actor._id }));
    },
    async update(actor, id, input) {
      return requireNote(await accountWrite(actor, scoped => scoped.notes.updateOwned(id, actor._id, input)));
    },
    async remove(actor, id) {
      requireNote(await accountWrite(actor, scoped => scoped.notes.removeOwned(id, actor._id)));
    },
  };
}
