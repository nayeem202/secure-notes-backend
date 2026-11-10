import { ApplicationError } from '../../domain/application-error.js';

export function persistenceError(error) {
  if (error instanceof ApplicationError) return error;
  let code;
  let message;
  if (error.code === 11000) {
    code = 'CONFLICT';
    const field = Object.keys(error.keyPattern ?? {})[0];
    message =
      field === 'username'
        ? 'That username is already taken'
        : field === 'email'
          ? 'An account with this email already exists'
          : 'An account with these details already exists';
  } else if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) {
    code = 'VALIDATION_ERROR';
    message = 'Invalid field value';
  } else if (
    error.code === 50 ||
    ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError'].includes(
      error.name,
    )
  ) {
    code = 'SERVICE_UNAVAILABLE';
    message = 'Database is temporarily unavailable';
  }
  if (!code) return error;
  const mapped = new ApplicationError(code, message);
  mapped.cause = error;
  return mapped;
}
