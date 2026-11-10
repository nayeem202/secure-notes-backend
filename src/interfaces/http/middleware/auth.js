import { ApiError } from '../api-error.js';
import { readSessionCookie } from '../session.js';

export const authenticate = ({ config, auth }) => async (req, res, next) => {
  const authorization = req.get('authorization');
  let token;
  if (authorization !== undefined) {
    const match = /^Bearer ([\w.-]+)$/i.exec(authorization);
    if (!match) throw new ApiError(401, 'UNAUTHORIZED', 'A valid Bearer token is required');
    token = match[1];
  } else {
    token = readSessionCookie(req, config);
  }
  req.user = await auth.authenticate(token);
  next();
};
