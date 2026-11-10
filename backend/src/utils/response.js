/**
 * Standard envelope — every API response uses this shape:
 *   success: { success: true, message, data }
 *   error:   { success: false, message, errors? }
 * Controllers stay thin by delegating formatting here. Legacy fields
 * (token, user, stats...) are preserved inside `data` for frontend compat.
 */
const sendSuccess = (res, { message = 'Operation completed', data = {}, statusCode = 200 } = {}) =>
  res.status(statusCode).json({ success: true, message, data });

const sendPaginated = (res, { message = 'Operation completed', items, page, limit, total } = {}) =>
  res.status(200).json({
    success: true,
    message,
    data: {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });

module.exports = { sendSuccess, sendPaginated };
