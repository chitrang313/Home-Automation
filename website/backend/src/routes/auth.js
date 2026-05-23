/**
 * Auth routes — public (no token required).
 *
 * Self-signup creates:
 *   - Firebase Auth user (email/password)
 *   - Firestore persons/{uid} document
 *   - Firestore houses/{houseId} document
 *   - Bidirectional link (person.houseIds ⇄ house.contactPersons)
 *
 * Admin self-grant: if the signup email matches ADMIN_EMAIL, the admin custom
 * claim is applied immediately so the user lands in the admin dashboard.
 */
const express = require('express');
const { admin } = require('../firebase-admin');
const { personRef, houseRef } = require('../utils/firestore-helpers');

const router = express.Router();

/**
 * POST /api/auth/signup
 * Body: { email, password, name, contact, house: { name, location? } }
 *
 * Signup is a two-stage write (Firebase Auth + Firestore) and we go to
 * some length to keep them consistent:
 *
 *   1. createUser may succeed and the Firestore batch then fail (e.g.
 *      Firestore not enabled, network blip, rules error). We catch that,
 *      delete the just-created Auth user, and surface the real error so
 *      the next attempt with the same email isn't blocked by an orphan.
 *
 *   2. If createUser itself fails with email-already-exists, the email
 *      may be a real registered user OR an orphan from a previous failed
 *      signup. We disambiguate by checking Firestore:
 *        - persons/{uid} EXISTS → real account, return 409.
 *        - persons/{uid} MISSING → orphan, adopt it: reset the password
 *          + displayName, then continue with the Firestore writes.
 *      This is safe because an orphan has no usable account anyway —
 *      the original signup never completed, so no one was ever signed in.
 */
router.post('/signup', async (req, res, next) => {
  let createdAuthUid = null;       // tracks an Auth user we created (for rollback)
  let adopted = false;             // true → don't roll back the Auth user on failure

  try {
    const { email, password, name, contact, house } = req.body || {};
    if (!email || !password || !name || !contact || !house?.name) {
      return res.status(400).json({
        error: 'email, password, name, contact, house.name all required',
      });
    }

    // ─── 1. Create (or adopt orphan) the Firebase Auth user ──────────────
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        // Only attach phoneNumber when it is E.164-formatted; the Firebase
        // Auth API rejects anything else and would block the signup.
        phoneNumber: typeof contact === 'string' && contact.startsWith('+')
          ? contact
          : undefined,
      });
      createdAuthUid = userRecord.uid;
    } catch (err) {
      if (err.code !== 'auth/email-already-exists') throw err;

      // Email exists in Firebase Auth. Decide: real user vs. orphan.
      const existing = await admin.auth().getUserByEmail(email);
      const personSnap = await personRef(existing.uid).get();
      if (personSnap.exists) {
        // Real, fully-registered user. Refuse politely.
        return res.status(409).json({
          error: 'Email already registered — please log in or reset your password.',
        });
      }

      // Orphan from a prior failed signup — adopt it.
      await admin.auth().updateUser(existing.uid, {
        password,
        displayName: name,
      });
      userRecord = await admin.auth().getUser(existing.uid);
      adopted = true;
    }

    // ─── 2. Auto-grant admin role to the configured ADMIN_EMAIL ──────────
    const isAdmin =
      email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (isAdmin) {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    }

    // ─── 3. Atomic Firestore batch: person + house + bidirectional link ──
    const db = admin.firestore();
    const batch = db.batch();
    const newHouseRef = db.collection('houses').doc(); // auto-ID
    const houseId = newHouseRef.id;
    const personId = userRecord.uid;
    const now = Date.now();

    batch.set(personRef(personId), {
      name,
      email,
      contact,
      role: isAdmin ? 'admin' : 'user',
      houseIds: { [houseId]: true },
      createdAt: now,
    });
    batch.set(newHouseRef, {
      name: house.name,
      location: house.location || '',
      contactPersons: { [personId]: true },
      createdAt: now,
    });
    await batch.commit();

    return res.json({ personId, houseId, isAdmin });
  } catch (err) {
    // Roll back the Auth user we created in this request — but never roll
    // back an orphan we adopted, since the Auth record predates this call.
    if (createdAuthUid && !adopted) {
      try {
        await admin.auth().deleteUser(createdAuthUid);
      } catch (cleanupErr) {
        console.warn(
          '[signup] failed to roll back Auth user',
          createdAuthUid,
          cleanupErr?.message
        );
      }
    }

    // Translate common Firebase Auth errors into clearer HTTP responses.
    if (err.code === 'auth/invalid-password') {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ error: 'Email is invalid.' });
    }
    if (err.code === 'auth/phone-number-already-exists') {
      return res.status(409).json({ error: 'Phone number already in use.' });
    }
    if (err.code === 'auth/invalid-phone-number') {
      return res.status(400).json({
        error: 'Phone number must be in international E.164 format (e.g. +919876543210), or omit the leading "+".',
      });
    }
    next(err);
  }
});

/** POST /api/auth/forgot-password — generates a reset link via Firebase Auth. */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const link = await admin.auth().generatePasswordResetLink(email);
    // NOTE: in production, email this link via SendGrid / SES instead of returning it.
    res.json({ ok: true, resetLink: link });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
