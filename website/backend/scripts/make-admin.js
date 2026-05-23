/**
 * Usage: node scripts/make-admin.js <email>
 *
 * Grants the admin custom claim AND sets persons/{uid}.role = "admin"
 * in Firestore. Idempotent — safe to re-run.
 *
 * The companion permanent self-heal in /api/persons/me ensures this stays
 * sticky even after token refresh, but running this script gives the user
 * admin access on their NEXT login without waiting for the self-heal cycle.
 */
require('dotenv').config();
const { initFirebase, admin } = require('../src/firebase-admin');

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/make-admin.js <email>');
    process.exit(1);
  }

  initFirebase();

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });

    // Mirror role into Firestore so the dashboard UI also reflects it
    // even before the next token refresh.
    await admin.firestore().collection('persons').doc(user.uid).set(
      { role: 'admin' },
      { merge: true }
    );

    console.log(`✓ ${email} (uid: ${user.uid}) is now admin.`);
    console.log('  → User must log out and log back in (or refresh token) for the claim to take effect.');
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
