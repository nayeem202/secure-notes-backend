import { ApplicationError } from '../../../domain/application-error.js';
import { ApiError } from '../api-error.js';

const applicationStatus = {
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SELF_PROTECTION: 400,
  INVALID_PASSWORD: 400,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  SERVICE_UNAVAILABLE: 503,
};

export const notFound = (req, res, next) =>
  next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found'));

export const errorHandler = (logger) => (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const known = error instanceof ApiError || error instanceof ApplicationError;
  let status =
    error instanceof ApiError
      ? error.status
      : error instanceof ApplicationError
        ? (applicationStatus[error.code] ?? 500)
        : 500;
  let code = known ? error.code : 'INTERNAL_ERROR';
  let message = known ? error.message : 'An unexpected error occurred';
  if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON body';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body exceeds 128 KB';
  }
  if (status >= 500) {
    logger.error('request_failed', {
      requestId: req.id,
      errorType: error.cause?.name ?? error.name,
      errorCode: error.cause?.code ?? error.code,
    });
  }
  res.status(status).json({
    error: {
      code,
      message,
      ...(known && error.details ? { details: error.details } : {}),
      requestId: req.id,
    },
  });
};
