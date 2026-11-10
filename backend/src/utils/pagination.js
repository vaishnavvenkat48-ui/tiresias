/**
 * Pagination helper — parses ?page=&limit= safely with sane caps.
 * Default 1/20, max limit 100.
 */
const getPagination = (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

module.exports = { getPagination };
