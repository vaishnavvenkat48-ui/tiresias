/** Base + typed HTTP errors for the centralized error handler. */
class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request.', details) {
    super(message, 400, details);
  }
}
class UnauthorizedError extends AppError {
  constructor(message = 'Not authorized.', details) {
    super(message, 401, details);
  }
}
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.', details) {
    super(message, 403, details);
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', details) {
    super(message, 404, details);
  }
}
class ConflictError extends AppError {
  constructor(message = 'Resource conflict.', details) {
    super(message, 409, details);
  }
}

module.exports = { AppError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError };
