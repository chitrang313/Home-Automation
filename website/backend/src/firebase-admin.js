const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * Initialises Firebase Admin SDK in one of three modes (tried in order):
 *
 *   1. Cloud Functions / GCP — default Application credentials (no JSON file needed).
 *   2. Generic host with FIREBASE_SERVICE_ACCOUNT_JSON env var (Vercel, Render, etc.)
 *   3. Local development — reads ./firebase-service-account.json file.
 *
 * Throws a descriptive Error if none of the modes can be used.
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
    console.log(`Firebase Admin initialized (Cloud Functions, project=${projectId})`);
    return admin;
  }

  // ── 2. Service account from env var (Vercel/Render/Railway/Fly) ──────────────
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch (e) {
      // Help diagnose two common copy-paste issues
      const len = raw.length;
      const head = raw.slice(0, 30).replace(/\s+/g, ' ');
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (length=${len}, starts with "${head}…"). ` +
          `Make sure you pasted the ENTIRE contents of the service-account JSON file ` +
          `starting with { "type": "service_account", ... } and ending with }.`
      );
    }

    // Some env-var UIs strip backslashes, leaving literal "\n" pairs in private_key.
    // Firebase Admin needs real newlines, so normalise.
    if (serviceAccount.private_key && !serviceAccount.private_key.includes('\n')) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields (project_id / private_key / client_email). ' +
          'Re-download the service-account JSON from Firebase Console → Project Settings → Service Accounts.'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL:
        process.env.DATABASE_URL ||
        `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
    });
    console.log(`Firebase Admin initialized (env service account, project=${serviceAccount.project_id})`);
    return admin;
  }

  // ── 3. Local development — service account JSON file ────────────────────────
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(__dirname, '..', 'firebase-service-account.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `No Firebase credentials available. Either: ` +
        `(a) Set FIREBASE_SERVICE_ACCOUNT_JSON env var with full service-account JSON contents, OR ` +
        `(b) Place the file at ${credPath} for local development.`
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(credPath)),
    databaseURL: process.env.DATABASE_URL,
  });
  console.log('Firebase Admin initialized (local JSON file)');
  return admin;
}

module.exports = { initFirebase, admin };
