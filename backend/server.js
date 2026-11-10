/**
 * Thin entry point — delegates to the layered src/ application.
 * Keeps `npm run dev` / `node server.js` working while the real
 * implementation lives in src/ per architecture spec.
 */
module.exports = require('./src/server');
