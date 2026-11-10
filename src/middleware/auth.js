import { User } from '../models/User.js';
import { ApiError } from '../utils/api-error.js';
import { readSessionCookie, verifyToken } from '../utils/tokens.js';

export const authenticate = config => async (req, res, next) => {
  const authorization = req.get('authorization');
  let token;
  if (authorization !== undefined) {
    const match = /^Bearer ([\w.-]+)$/i.exec(authorization);
    if (!match) throw new ApiError(401, 'UNAUTHORIZED', 'A valid Bearer token is required');
    token = match[1];
  } else {
    token = readSessionCookie(req, config);
  }
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
  let payload;
  try { payload = verifyToken(token, config); } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Session is invalid or expired');
  }
  // Always read current role/status: token claims never grant stale privileges.
  const user = await User.findById(payload.sub).select('+tokenVersion').lean();
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Session is invalid or expired');
  }
  req.user = user;
  next();
};
