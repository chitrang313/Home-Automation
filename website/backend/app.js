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

// ─── Public probes ─────────────────────────────────────────────────────────
// Two endpoints so that hitting the bare host shows something useful, and so
// Vercel never falls back to its auto-rendered HTML 404 page (which injects
// `vercel.live/_next-live/feedback/feedback.js` under a `default-src 'none'`
// CSP and produces a noisy — but harmless — console error).
const probeBody = () => ({
  ok: true,
  ts: Date.now(),
  service: 'home-automation-backend',
});
app.get('/',            (req, res) => res.json(probeBody()));
app.get('/api',         (req, res) => res.json(probeBody()));
app.get('/api/health',  (req, res) => res.json(probeBody()));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/persons', personRoutes);
app.use('/api/houses',  houseRoutes);
// Firmware lives under /api/houses/* and uses mergeParams internally.
app.use('/api/houses',  firmwareRoutes);

// ─── 404 for unknown paths (must run AFTER all routes) ─────────────────────
// Returns JSON instead of letting the request fall through to Vercel's HTML
// 404, which is what was injecting the blocked feedback.js script.
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ─── Centralised error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[ERR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// Default export for Vercel auto-detection AND named export for legacy importers.
module.exports = app;
module.exports.app = app;
