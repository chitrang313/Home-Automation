/**
 * Shared Express app — used by both server.js (local dev) and index.js (Firebase Functions).
 * No app.listen() and no dotenv here — those belong to the respective entry points.
 */
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./src/firebase-admin');

const authRoutes = require('./src/routes/auth');
const personRoutes = require('./src/routes/persons');
const houseRoutes = require('./src/routes/houses');

initFirebase();

const app = express();

// CORS: allow the GitHub Pages origin in production + localhost during dev.
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
      // Allow same-origin (no Origin header) and any whitelisted origin
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/persons', personRoutes);
app.use('/api/houses', houseRoutes);

app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = { app };
