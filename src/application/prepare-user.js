export async function prepareUser(input, passwords) {
  const { name, username, email, interests = [], role = 'user', password } = input;
  return { name, username, email, interests, role, passwordHash: await passwords.hash(password) };
}
