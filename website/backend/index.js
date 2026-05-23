/**
 * Firebase Cloud Functions entry point.
 *   firebase deploy --only functions → exports the Express app as a Gen 2 HTTP function.
 *
 * Deployed URL: https://<REGION>-<PROJECT_ID>.cloudfunctions.net/api/...
 * (or rewritten via Firebase Hosting if you set that up later)
 *
 * Secrets used (set with `firebase functions:secrets:set <NAME>`):
 *   - ADMIN_EMAIL  : email that gets auto-granted admin claim on signup
 *
 * Note: DATABASE_URL is derived automatically from the Firebase project in Cloud Functions —
 * no service-account JSON is needed because admin.initializeApp() uses default credentials.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ADMIN_EMAIL = defineSecret('ADMIN_EMAIL');

// Lazily require the app so the secret value is available via process.env before init.
exports.api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    cpu: 1,
    timeoutSeconds: 60,
    secrets: [ADMIN_EMAIL],
  },
  (req, res) => {
    // Inject the secret into process.env so the existing code (which reads
    // process.env.ADMIN_EMAIL) works without modification.
    process.env.ADMIN_EMAIL = ADMIN_EMAIL.value();
    const { app } = require('./app');
    return app(req, res);
  }
);
