const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * Initialises Firebase Admin SDK in one of two modes:
 *
 *   1. Cloud Functions / GCP environment — uses default Application credentials
 *      (no service-account JSON needed). Detected via FUNCTION_TARGET / K_SERVICE env vars.
 *
 *   2. Local development — reads service-account JSON from GOOGLE_APPLICATION_CREDENTIALS
 *      or ./firebase-service-account.json relative to the backend folder.
 */
function initFirebase() {
  if (admin.apps.length) return admin;

  const isCloudFunctions =
    process.env.FUNCTION_TARGET ||
    process.env.K_SERVICE ||
    process.env.FUNCTIONS_EMULATOR;

  if (isCloudFunctions) {
    // GOOGLE_CLOUD_PROJECT is set automatically by Cloud Functions
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    admin.initializeApp({
      databaseURL:
        process.env.DATABASE_URL ||
        (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined),
    });
    console.log(`Firebase Admin SDK initialized (Cloud Functions, project=${projectId})`);
    return admin;
  }

  // Local development path
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(__dirname, '..', 'firebase-service-account.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Firebase service account JSON not found at ${credPath}. ` +
        `Download it from Firebase Console → Project Settings → Service Accounts.`
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(credPath)),
    databaseURL: process.env.DATABASE_URL,
  });
  console.log('Firebase Admin SDK initialized (local)');
  return admin;
}

module.exports = { initFirebase, admin };
