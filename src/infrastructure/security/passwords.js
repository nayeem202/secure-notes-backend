import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

export function createPasswordHasher(rounds) {
  return {
    hash: (value) => bcrypt.hash(value, rounds),
    compare: (value, hash) => bcrypt.compare(value, hash),
    dummyHash: bcrypt.hash(randomBytes(32).toString('hex'), rounds),
  };
}
