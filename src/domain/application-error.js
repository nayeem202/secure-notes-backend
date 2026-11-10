export class ApplicationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.details = details;
  }
}
