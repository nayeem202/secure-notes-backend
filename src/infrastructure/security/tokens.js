import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

const issuer = 'secure-notes';
const audience = 'secure-notes-api';

export function issueToken(user, config) {
  return jwt.sign({ ver: user.tokenVersion }, config.JWT_SECRET, {
    algorithm: 'HS256', subject: String(user._id), issuer, audience,
    expiresIn: config.JWT_TTL_SECONDS, jwtid: randomUUID(),
  });
}

export function verifyToken(token, config) {
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer, audience });
  if (typeof payload !== 'object' || !/^[a-f\d]{24}$/i.test(payload.sub ?? '') ||
      !Number.isInteger(payload.ver) || !Number.isInteger(payload.exp)) {
    throw new jwt.JsonWebTokenError('Invalid token claims');
  }
  return payload;
}

export function createTokenService(config) {
  return {
    issue: user => issueToken(user, config),
    verify: token => verifyToken(token, config),
    expiresIn: config.JWT_TTL_SECONDS,
  };
}
