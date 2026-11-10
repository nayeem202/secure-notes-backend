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

export const cookieName = config => config.NODE_ENV === 'production'
  ? '__Host-secure_notes_session' : 'secure_notes_session';

export function sessionCookieOptions(config) {
  return { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
}

export function setSession(res, user, config) {
  const accessToken = issueToken(user, config);
  res.cookie(cookieName(config), accessToken, {
    ...sessionCookieOptions(config), maxAge: config.JWT_TTL_SECONDS * 1000,
  });
  return { accessToken, expiresIn: config.JWT_TTL_SECONDS };
}

export function clearSession(res, config) {
  res.clearCookie(cookieName(config), sessionCookieOptions(config));
}

export function readSessionCookie(req, config) {
  const name = `${cookieName(config)}=`;
  const value = (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(name));
  if (!value) return undefined;
  try { return decodeURIComponent(value.slice(name.length)); } catch { return undefined; }
}
