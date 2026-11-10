import { ApiError } from '../utils/api-error.js';

export const protectMutations = config => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if ((origin && origin !== config.APP_ORIGIN) || req.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'CSRF_REJECTED', 'Cross-origin writes are not allowed');
  }
  // Custom header cannot be sent by a cross-site HTML form. No CORS is enabled.
  // Bearer API clients do not rely on ambient cookies and can omit this header.
  if (!req.get('authorization') && req.get('x-csrf-protection') !== '1') {
    throw new ApiError(403, 'CSRF_REJECTED', 'Send X-CSRF-Protection: 1 for cookie-based writes');
  }
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json body');
  }
  next();
};
