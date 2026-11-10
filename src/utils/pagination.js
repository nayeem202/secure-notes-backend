export const MAX_OFFSET = 100000;

export function pagination(query) {
  const { page, limit } = query;
  return { page, limit, skip: (page - 1) * limit };
}

export function pageInfo(total, { page, limit }) {
  const totalPages = Math.ceil(total / limit);
  return {
    page, limit, total, totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export async function listPage(Model, filter, query, { select, hint, populate } = {}) {
  const info = pagination(query);
  let find = Model.find(filter).sort({ _id: -1 }).skip(info.skip).limit(info.limit);
  let count = Model.countDocuments(filter);
  if (select) find = find.select(select);
  if (populate) find = find.populate(populate);
  find = find.lean();
  if (hint) {
    find = find.hint(hint);
    count = count.hint(hint);
  }
  const [data, total] = await Promise.all([find, count]);
  return { data, pagination: pageInfo(total, info) };
}
