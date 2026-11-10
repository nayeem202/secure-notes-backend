export const cookieName = config => config.NODE_ENV === 'production'
  ? '__Host-secure_notes_session' : 'secure_notes_session';

export function sessionCookieOptions(config) {
  return { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
}

export function setSession(res, session, config) {
  res.cookie(cookieName(config), session.accessToken, {
    ...sessionCookieOptions(config), maxAge: session.expiresIn * 1000,
  });
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
