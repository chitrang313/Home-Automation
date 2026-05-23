const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * Initialises Firebase Admin SDK once per process.
 *
 * Three credential modes (auto-detected, in order):
 *
 *   1. Cloud Functions / GCP environment
 *      Detected via FUNCTION_TARGET / K_SERVICE / FUNCTIONS_EMULATOR env vars.
 *      Uses Application Default Credentials — no JSON file required.
 *
 *   2. Serverless host (Vercel etc.) with FIREBASE_SERVICE_ACCOUNT_JSON env var
 *      The full JSON is pasted into the env var. We parse it and pass to
 *      admin.credential.cert(). Avoids checking the JSON into git.
 *
 *   3. Local development
 *      Falls back to a service-account JSON file on disk.
 *      Path: $GOOGLE_APPLICATION_CREDENTIALS or ./firebase-service-account.json
 *
 * Exposes:
 *   - admin       : the firebase-admin namespace
 *   - initFirebase: idempotent initialiser; safe to call from any entry point
 *   - getFirestore: returns the configured Firestore database
 *   - getRtdb     : returns the configured Realtime Database
 */
function initFirebase() {
  if (admin.apps.length) return admin;

  const isCloudFunctions =
    process.env.FUNCTION_TARGET ||
    process.env.K_SERVICE ||
    process.env.FUNCTIONS_EMULATOR;

  // ─── Mode 1: Cloud Functions ──────────────────────────────────────────────
  if (isCloudFunctions) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    admin.initializeApp({
      databaseURL:
        process.env.DATABASE_URL ||
        (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined),
    });
    console.log(`Firebase Admin SDK initialised (Cloud Functions, project=${projectId})`);
    return admin;
  }

  // ─── Mode 2: Vercel / serverless via env-var JSON ─────────────────────────
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    let credential;
    try {
      credential = JSON.parse(inlineJson);
    } catch (e) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
          'Paste the full contents of firebase-service-account.json.'
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(credential),
      databaseURL: process.env.DATABASE_URL,
    });
    console.log('Firebase Admin SDK initialised (env-var JSON)');
    return admin;
  }

  // ─── Mode 3: Local file ───────────────────────────────────────────────────
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.resolve(__dirname, '..', 'firebase-service-account.json');

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Firebase service account JSON not found at ${credPath}. ` +
        'Download it from Firebase Console → Project Settings → Service Accounts, ' +
        'or set FIREBASE_SERVICE_ACCOUNT_JSON env var.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(credPath)),
    databaseURL: process.env.DATABASE_URL,
  });
  console.log('Firebase Admin SDK initialised (local file)');
  return admin;
}

/** Convenience accessor — never call before initFirebase() */
function getFirestore() {
  return admin.firestore();
}

/** Convenience accessor — never call before initFirebase() */
function getRtdb() {
  return admin.database();
}

module.exports = { initFirebase, admin, getFirestore, getRtdb };
