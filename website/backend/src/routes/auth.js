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
 */
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, contact, house } = req.body || {};
    if (!email || !password || !name || !contact || !house?.name) {
      return res.status(400).json({
        error: 'email, password, name, contact, house.name all required',
      });
    }

    // ─── Create the Firebase Auth user ────────────────────────────────────
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: contact.startsWith('+') ? contact : undefined,
    });

    // ─── Auto-grant admin role to the configured ADMIN_EMAIL ──────────────
    const isAdmin =
      email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (isAdmin) {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    }

    // ─── Atomic Firestore batch: person + house + bidirectional link ──────
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

    res.json({ personId, houseId, isAdmin });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Email already registered' });
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
