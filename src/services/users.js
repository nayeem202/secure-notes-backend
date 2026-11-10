import bcrypt from 'bcrypt';
import { User } from '../models/User.js';

export async function buildUser(input, config) {
  const { password, ...fields } = input;
  return { ...fields, passwordHash: await bcrypt.hash(password, config.BCRYPT_ROUNDS) };
}

export async function createUser(input, config) {
  return User.create(await buildUser(input, config));
}
