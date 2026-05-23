/**
 * Usage: node scripts/make-admin.js <email>
 * Grants the admin custom claim AND sets /persons/{id}/role = "admin".
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
    await admin.database().ref(`persons/${user.uid}/role`).set('admin');
    console.log(`✓ ${email} (id: ${user.uid}) is now admin.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
