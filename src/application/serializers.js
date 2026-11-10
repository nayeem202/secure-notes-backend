export const USER_FIELDS = '_id name username email role interests isActive createdAt updatedAt';

export function serializeUser(user) {
  return Object.fromEntries(USER_FIELDS.split(' ').map(key => [key, user[key]]));
}
