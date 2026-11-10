/**
 * sanitize — lightweight NoSQL-injection + prototype-pollution guard.
 * Strips keys starting with $ or containing . from body/query/params.
 * (Dependency-free alternative to express-mongo-sanitize.)
 */
const clean = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__') {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      clean(obj[key]);
    }
  }
};

const sanitize = (req, _res, next) => {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
};

module.exports = { sanitize };
