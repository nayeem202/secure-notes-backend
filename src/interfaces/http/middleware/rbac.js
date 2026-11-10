import { ApiError } from '../api-error.js';

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
  if (!roles.includes(req.user.role)) throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required');
  next();
};
