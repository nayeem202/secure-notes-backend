import { ApiError } from '../api-error.js';

export const validate = (schemas = {}) => (req, res, next) => {
  const validated = {};
  for (const [source, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', result.error.issues.map(issue => ({
        field: [source, ...issue.path].join('.'), message: issue.message,
      })));
    }
    validated[source] = result.data;
  }
  req.validated = validated;
  next();
};
