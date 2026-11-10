const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');

/**
 * authMiddleware — requires `Authorization: Bearer <accessToken>`.
 * Attaches full Mongoose `req.user`. Alias `protect` kept for legacy imports.
 */
const authMiddleware = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const err = new Error('Not authorized — missing token.');
    err.statusCode = 401;
    return next(err);
  }
  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) {
      const err = new Error('Not authorized — user not found.');
      err.statusCode = 401;
      return next(err);
    }
    req.user = user;
    next();
  } catch {
    const err = new Error('Not authorized — invalid or expired token.');
    err.statusCode = 401;
    next(err);
  }
};

/** authorize(...roles) — require one of the given roles (case-insensitive). */
const authorize = (...roles) => (req, _res, next) => {
  const allowed = roles.map((r) => String(r).toUpperCase());
  const actual = String(req.user?.role || '').toUpperCase();
  if (!allowed.includes(actual)) {
    const err = new Error('Forbidden — insufficient permissions.');
    err.statusCode = 403;
    return next(err);
  }
  next();
};

module.exports = { authMiddleware, protect: authMiddleware, authorize };
