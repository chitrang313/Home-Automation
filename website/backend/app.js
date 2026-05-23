/**
 * Shared Express app — used by server.js (local dev), Vercel, and Firebase Functions.
 * No app.listen() and no dotenv here — those belong to the respective entry points.
 *
 * Routes:
 *   /api/health        public liveness probe
 *   /api/auth          self-signup + password reset
 *   /api/persons       person CRUD + /me (Firestore)
 *   /api/houses        houses / rooms / boards / appliances (Firestore)
 *   /api/houses/.../firmware  per-board .ino generator + download
 */
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./src/firebase-admin');

const authRoutes     = require('./src/routes/auth');
const personRoutes   = require('./src/routes/persons');
const houseRoutes    = require('./src/routes/houses');
const firmwareRoutes = require('./src/routes/firmware');

initFirebase();

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────
// Whitelisted defaults cover GitHub Pages (prod frontend) + local Vite dev.
// CORS_ORIGIN env var (comma-separated) lets ops add more without code changes.
const defaultOrigins = [
  'https://chitrang313.github.io',
  'http://localhost:5173',
];
const extraOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...extraOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
  })
);
app.use(express.json({ limit: '256kb' }));

// ─── Public probe ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ ok: true, ts: Date.now(), service: 'home-automation-backend' })
);

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/persons', personRoutes);
app.use('/api/houses',  houseRoutes);
// Firmware lives under /api/houses/* and uses mergeParams internally.
app.use('/api/houses',  firmwareRoutes);

// ─── Centralised error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[ERR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Default export for Vercel auto-detection AND named export for legacy importers.
module.exports = app;
module.exports.app = app;
