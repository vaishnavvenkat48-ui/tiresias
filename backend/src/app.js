const path = require('path');
// Load backend/.env by its own location, so `npm start` from the repo root finds it too.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const { requireDB } = require('./middleware/requireDB');
const { sanitize } = require('./middleware/sanitize');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const graphRoutes = require('./routes/graph.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiRoutes = require('./routes/ai.routes');
const pathRoutes = require('./routes/path.routes');
const resourceRoutes = require('./routes/resource.routes');
const activityRoutes = require('./routes/activity.routes');
const publicRoutes = require('./routes/public.routes');
const env = require('./config/env');
const { providerStatus } = require('./utils/http');

const createApp = () => {
  const app = express();

  // Behind a host's proxy (Render, Fly, Nginx) the client IP comes from X-Forwarded-For;
  // per-IP limits and anonymous-trial quotas depend on this being right.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https://upload.wikimedia.org', 'https://*.wikimedia.org', 'https://i.ytimg.com', 'https://*.staticflickr.com', 'https://images.unsplash.com', 'https://api.openverse.org'],
        'frame-src': ["'self'", 'https://www.youtube-nocookie.com'],
        'connect-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'script-src': ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Global + stricter auth throttling
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
    // JSON like every other error, so the sign-in and sign-up forms can show it instead of a generic failure.
    message: { success: false, message: 'Too many sign-in attempts from this network. Please try again in a few minutes.' },
  }));

  app.get('/api/health', (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
      success: true,
      message: 'Tiresias backend is running.',
      data: {
        status: 'ok',
        service: 'tiresias-backend',
        db: states[mongoose.connection.readyState] || 'unknown',
        time: new Date().toISOString(),
        // which integrations are configured (never the keys themselves) + any paused by quota
        providers: {
          gemini: !!env.gemini.apiKey,
          youtube: !!env.youtubeApiKey,
          openalexKey: !!env.openalexApiKey,
          unsplash: !!env.unsplashAccessKey,
          keyless: ['wikidata', 'wikipedia', 'wikimedia-commons', 'crossref', 'openalex', 'openverse'],
          paused: providerStatus(),
        },
      },
    });
  });

  // Domain routes (all gated by requireDB for friendly 503s)
  app.use('/api/public', requireDB, publicRoutes);
  app.use('/api/auth', requireDB, authRoutes);
  app.use('/api/users', requireDB, userRoutes);
  app.use('/api/graphs', requireDB, graphRoutes);
  app.use('/api/analytics', requireDB, analyticsRoutes);
  app.use('/api/ai', requireDB, aiRoutes);
  app.use('/api/learning-paths', requireDB, pathRoutes);
  app.use('/api/resources', requireDB, resourceRoutes);
  app.use('/api/activity', requireDB, activityRoutes);
  app.use('/api', notFound);

  // Production: serve the built frontend from the same origin (one deployable service).
  const dist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  if (process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '7d', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.json({ success: true, message: 'Tiresias API.', data: { service: 'tiresias-backend', docs: '/api/health' } }));
  }

  app.use(errorHandler);
  return app;
};

module.exports = createApp;
