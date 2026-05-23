const express = require('express');
const { admin } = require('../firebase-admin');
const router = express.Router();

/**
 * POST /api/auth/signup
 * Self-signup: creates Firebase Auth user + /persons/{uid} + /houses/{houseId},
 * and links them (person.houseIds[houseId]=true, house.contactPersons[uid]=true).
 *
 * Body: { email, password, name, contact, house: { name, location } }
 */
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, contact, house } = req.body || {};
    if (!email || !password || !name || !contact || !house?.name) {
      return res.status(400).json({ error: 'email, password, name, contact, house.name all required' });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: contact.startsWith('+') ? contact : undefined,
    });

    const isAdmin = email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (isAdmin) {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    }

    const db = admin.database();
    const houseRef = db.ref('houses').push();
    const houseId = houseRef.key;
    const now = Date.now();
    const personId = userRecord.uid;

    const updates = {};
    updates[`persons/${personId}`] = {
      name,
      email,
      contact,
      role: isAdmin ? 'admin' : 'user',
      houseIds: { [houseId]: true },
      createdAt: now,
    };
    updates[`houses/${houseId}`] = {
      name: house.name,
      location: house.location || '',
      contactPersons: { [personId]: true },
      createdAt: now,
    };
    await db.ref().update(updates);

    res.json({ personId, houseId, isAdmin });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(err);
  }
});

/** POST /api/auth/forgot-password — sends Firebase reset email */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const link = await admin.auth().generatePasswordResetLink(email);
    res.json({ ok: true, resetLink: link }); // Note: in production, send via email
  } catch (err) {
    next(err);
  }
});

module.exports = router;
