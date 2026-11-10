const mongoose = require('mongoose');

/** 503 fast-fail when no DB connection (avoids Mongoose buffering timeouts). */
const requireDB = (_req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    success: false,
    message: 'Database unavailable — please start MongoDB (or check MONGO_URI) and try again.',
  });
};

module.exports = { requireDB };
