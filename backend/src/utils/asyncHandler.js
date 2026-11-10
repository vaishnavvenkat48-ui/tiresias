/** Wrap async route handlers so errors flow to the central error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
