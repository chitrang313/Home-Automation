/**
 * Vercel serverless entry point.
 *
 * Vercel auto-detects this file and runs it as a Node.js serverless function.
 * `vercel.json` rewrites every incoming path to this handler, so the Express app
 * sees the original URL (/api/auth/signup etc.) and handles it normally.
 */
const { app } = require('../app');
module.exports = app;
