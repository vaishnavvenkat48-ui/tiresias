/**
 * Central error handler (mounted last). Normalizes:
 *  - AppError subclasses (statusCode)
 *  - Mongoose duplicate key (11000 -> 409)
 *  - Mongoose CastError (bad ObjectId -> 400)
 *  - express-validator / zod details passthrough
 * Always responds { success: false, message, errors? }.
 */
const errorHandler = (err, _req, res, _next) => {
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `That ${field} is already taken.` });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid resource id.' });
  }
  if (err && /buffering timed out|bufferCommands/i.test(err.message || '')) {
    return res.status(503).json({ success: false, message: 'Database unavailable — please start MongoDB (or check MONGO_URI) and try again.' });
  }
  if (process.env.NODE_ENV !== 'test') console.error('[error]', err.message);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(err.details ? { errors: err.details } : {}),
  });
};

/** 404 for unknown /api routes */
const notFound = (_req, res) => res.status(404).json({ success: false, message: 'Route not found.' });

module.exports = { errorHandler, notFound };
