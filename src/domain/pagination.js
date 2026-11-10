export const MAX_OFFSET = 100000;

export function pagination({ page, limit }) {
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
