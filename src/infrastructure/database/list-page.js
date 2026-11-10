import { pagination, pageInfo } from '../../domain/pagination.js';
import { toRecord } from './records.js';

export async function listPage(Model, filter, query, { select, hint, populate, session } = {}) {
  const info = pagination(query);
  let find = Model.find(filter).sort({ _id: -1 }).skip(info.skip).limit(info.limit);
  let count = Model.countDocuments(filter);
  if (select) find = find.select(select);
  if (populate) find = find.populate(populate);
  if (session) {
    find = find.session(session);
    count = count.session(session);
  }
  if (hint) {
    find = find.hint(hint);
    count = count.hint(hint);
  }
  const [data, total] = await Promise.all([find.lean(), count]);
  return { data: toRecord(data), pagination: pageInfo(total, info) };
}
