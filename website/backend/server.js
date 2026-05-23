require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initFirebase } = require('./src/firebase-admin');

const authRoutes = require('./src/routes/auth');
const personRoutes = require('./src/routes/persons');
const houseRoutes = require('./src/routes/houses');

initFirebase();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
