/**
 * Shared Express app — used by both server.js (local dev), index.js (Firebase Functions),
 * and api/index.js (Vercel). No app.listen() and no dotenv here — those belong to the
 * respective entry points.
 *
 * Firebase Admin is initialized lazily on the first request (not at module load),
 * so a bad env-var setup returns a clean JSON 500 instead of crashing the function.
 */
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./src/firebase-admin');

const app = express();

// CORS: allow GitHub Pages origin, localhost dev, and any vercel.app preview
const defaultOrigins = ['https://chitrang313.github.io', 'http://localhost:5173'];
const extraOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...extraOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / no Origin header
      if (allowedOrigins.includes(origin)) return callback(null, true);
      try {
        if (/\.vercel\.app$/.test(new URL(origin).hostname)) return callback(null, true);
      } catch {
        /* invalid origin URL — fall through to deny */
      }
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
  })
);
app.use(express.json());

// ── Lazy Firebase init middleware ───────────────────────────────────────────
// Runs on first incoming request; if it fails, the function stays alive and
// every request gets a structured 500 explaining what went wrong.
let initError = null;
let initialized = false;
app.use((req, res, next) => {
  if (initialized) return next();
  try {
    initFirebase();
    initialized = true;
    next();
  } catch (e) {
    initError = e;
    console.error('[FIREBASE INIT FAILED]', e.message);
    res.status(500).json({
      error: 'Backend initialization failed',
      detail: e.message,
      hint: 'Check the host\'s environment variables — most likely FIREBASE_SERVICE_ACCOUNT_JSON is missing or malformed.',
    });
  }
});

// ── Root sanity check (no DB call — safe even if Firebase init failed) ──────
app.get('/', (req, res) =>
  res.json({
    ok: true,
    service: 'home-automation-backend',
    initialized,
    initError: initError ? initError.message : null,
    routes: ['/api/health', '/api/auth/*', '/api/persons/*', '/api/houses/*'],
  })
);
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Routes (loaded only after Firebase init is in place via the middleware) ──
const authRoutes = require('./src/routes/auth');
const personRoutes = require('./src/routes/persons');
const houseRoutes = require('./src/routes/houses');
app.use('/api/auth', authRoutes);
app.use('/api/persons', personRoutes);
app.use('/api/houses', houseRoutes);

app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = { app };
