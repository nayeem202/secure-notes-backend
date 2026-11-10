import { ApiError } from '../api-error.js';

export const protectMutations = (config) => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const trustedOrigin =
    origin === config.APP_ORIGIN || Boolean(config.API_ORIGIN && origin === config.API_ORIGIN);

  if (
    (origin && !trustedOrigin) ||
    (!trustedOrigin && req.get('sec-fetch-site') === 'cross-site')
  ) {
    throw new ApiError(403, 'CSRF_REJECTED', 'Cross-origin writes are not allowed');
  }

  if (!req.get('authorization') && req.get('x-csrf-protection') !== '1') {
    throw new ApiError(403, 'CSRF_REJECTED', 'Send X-CSRF-Protection: 1 for cookie-based writes');
  }
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json body');
  }
  next();
};
