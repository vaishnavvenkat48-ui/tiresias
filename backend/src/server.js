const createApp = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const start = async () => {
  require('./config/env').validate(); // fail fast on bad production config; logs provider status
  const app = createApp();
  const server = app.listen(PORT, () => console.log(`[server] Tiresias API listening on http://localhost:${PORT}`));
  await connectDB();
  return server;
};

// Auto-start when run directly OR via the thin backend/server.js entry.
// (require.main is the entry file; module is this file.)
if (require.main === module || (require.main && /backend[/\\]server\.js$/.test(require.main.filename))) {
  start();
}

module.exports = start;
