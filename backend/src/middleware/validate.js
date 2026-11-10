const { validationResult } = require('express-validator');

/** 400 with field errors when express-validator finds violations. */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

module.exports = { validate };
