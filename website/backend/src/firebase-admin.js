const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * Initialises Firebase Admin SDK in one of three modes (tried in order):
 *
 *   1. Cloud Functions / GCP — uses default Application credentials automatically.
 *      Detected via FUNCTION_TARGET / K_SERVICE env vars.
 *
 *   2. Generic host with FIREBASE_SERVICE_ACCOUNT_JSON env var (Vercel, Render,
 *      Railway, Fly.io, etc.). The value must be the entire JSON contents.
 *
 *   3. Local development — reads ./firebase-service-account.json (or the path in
 *      GOOGLE_APPLICATION_CREDENTIALS).
 */
function initFirebase() {
  if (admin.apps.length) return admin;

  // ── 1. Firebase Cloud Functions / GCP ────────────────────────────────────────
  const isCloudFunctions =
    process.env.FUNCTION_TARGET ||
    process.env.K_SERVICE ||
    process.env.FUNCTIONS_EMULATOR;

  if (isCloudFunctions) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    admin.initializeApp({
      databaseURL:
        process.env.DATABASE_URL ||
        (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined),
    });
    console.log(`Firebase Admin SDK initialized (Cloud Functions, project=${projectId})`);
    return admin;
  }

  // ── 2. Service account from env var (Vercel / Render / Railway / Fly.io) ────
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON. ' +
          'Paste the full contents of the downloaded service-account JSON as the env value.'
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.DATABASE_URL,
    });
    console.log('Firebase Admin SDK initialized (env-based service account)');
    return admin;
  }

  // ── 3. Local development — service account JSON file ────────────────────────
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(__dirname, '..', 'firebase-service-account.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Firebase service account JSON not found at ${credPath}. ` +
        `For deployment, set the FIREBASE_SERVICE_ACCOUNT_JSON env var with the file's contents. ` +
        `For local dev, download the JSON from Firebase Console → Project Settings → Service Accounts.`
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(credPath)),
    databaseURL: process.env.DATABASE_URL,
  });
  console.log('Firebase Admin SDK initialized (local JSON file)');
  return admin;
}

module.exports = { initFirebase, admin };
