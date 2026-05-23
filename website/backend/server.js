/**
 * Local development entry point.
 *   npm run dev → starts Express on PORT (default 5000) with .env loaded.
 *
 * In production, Firebase Functions imports the Express app from app.js via index.js
 * — this file is NOT used in the deployed function.
 */
require('dotenv').config();
const { app } = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
