import { ApiError } from '../utils/api-error.js';

export const notFound = (req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found'));

export const errorHandler = logger => (error, req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error instanceof ApiError ? error.status : 500;
  let code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  let message = error instanceof ApiError ? error.message : 'An unexpected error occurred';
  if (error.code === 11000) {
    status = 409; code = 'CONFLICT';
    const field = Object.keys(error.keyPattern ?? {})[0];
    message = field === 'username' ? 'That username is already taken'
      : field === 'email' ? 'An account with this email already exists' : 'An account with these details already exists';
  } else if (error.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body';
  } else if (error.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds 128 KB';
  } else if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'StrictModeError') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid field value';
  } else if (error.code === 50 || error.name === 'MongoServerSelectionError' || error.name === 'MongoNetworkError') {
    status = 503; code = 'SERVICE_UNAVAILABLE'; message = 'Database is temporarily unavailable';
  }
  if (status >= 500) {
    // Error messages from database drivers can contain a URI or credentials.
    logger.error('request_failed', { requestId: req.id, errorType: error.name, errorCode: error.code });
  }
  res.status(status).json({ error: {
    code, message, ...(error instanceof ApiError && error.details ? { details: error.details } : {}), requestId: req.id,
  } });
};
