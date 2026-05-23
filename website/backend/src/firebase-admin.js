const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

function initFirebase() {
  if (admin.apps.length) return admin;

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

  console.log('Firebase Admin SDK initialized');
  return admin;
}

module.exports = { initFirebase, admin };
