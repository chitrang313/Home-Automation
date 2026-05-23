/**
 * Cleanup legacy paths in Firebase Realtime Database.
 *
 * Usage:
 *   node scripts/cleanup-rtdb.js           # dry-run (just lists what would change)
 *   node scripts/cleanup-rtdb.js --apply   # actually delete
 *
 * Removes known legacy paths created during early testing:
 *   /F1, /F2, /F3, /F4      — old fan boolean nodes
 *   /L1, /L2, /L3, /L4      — old light boolean nodes
 *   /users                  — pre-refactor schema (replaced by /persons)
 *   /test                   — anything left over
 *
 * Keeps:
 *   /persons, /houses        — current schema
 *   /relay1..4              — used by the existing ESP32 firmware
 *
 * Unrecognised top-level paths are listed for manual review (no automatic
 * deletion — so you don't lose anything important).
 */
require('dotenv').config();
const { initFirebase, admin } = require('../src/firebase-admin');

const RECOGNISED_KEEP = new Set([
  'persons',
  'houses',
  'relay1', 'relay2', 'relay3', 'relay4',
]);

const LEGACY_DELETE = [
  'F1', 'F2', 'F3', 'F4',
  'L1', 'L2', 'L3', 'L4',
  'users',
  'test',
];

(async () => {
  const apply = process.argv.includes('--apply');

  initFirebase();
  const db = admin.database();
  const rootSnap = await db.ref('/').get();
  const data = rootSnap.val() || {};
  const keys = Object.keys(data).sort();

  console.log('\n📊 Top-level paths in your RTDB:');
  console.log('─────────────────────────────────');

  const toDelete = [];
  const unknown = [];

  for (const key of keys) {
    if (LEGACY_DELETE.includes(key)) {
      toDelete.push(key);
      console.log(`  🗑  /${key}  (legacy — will be removed)`);
    } else if (RECOGNISED_KEEP.has(key)) {
      console.log(`  ✓  /${key}  (keep)`);
    } else {
      unknown.push(key);
      console.log(`  ?  /${key}  (unrecognised — review manually)`);
    }
  }

  if (unknown.length) {
    console.log('\n⚠  Unrecognised paths above will NOT be auto-deleted.');
    console.log('   Delete them manually in Firebase Console if you confirm they are unused.');
  }

  if (toDelete.length === 0) {
    console.log('\n✓ No legacy paths to remove. Database is already tidy.\n');
    process.exit(0);
  }

  if (!apply) {
    console.log(`\nDry run — ${toDelete.length} legacy path(s) would be removed.`);
    console.log('Re-run with --apply to actually delete:');
    console.log('   node scripts/cleanup-rtdb.js --apply\n');
    process.exit(0);
  }

  console.log(`\nRemoving ${toDelete.length} legacy path(s)…`);
  for (const key of toDelete) {
    console.log(`  ✗  /${key}`);
    await db.ref(`/${key}`).remove();
  }
  console.log('\n✓ Cleanup complete.\n');
  process.exit(0);
})().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
