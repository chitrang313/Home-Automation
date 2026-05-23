const express = require('express');
const { admin } = require('../firebase-admin');
const { verifyAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

/** GET /api/persons/me — current logged-in person's profile */
router.get('/me', verifyAuth, async (req, res, next) => {
  try {
    const snap = await admin.database().ref(`persons/${req.user.uid}`).get();
    if (!snap.exists()) return res.status(404).json({ error: 'Person profile not found' });
    res.json({ id: req.user.uid, ...snap.val(), admin: req.user.admin });
  } catch (err) {
    next(err);
  }
});

/** GET /api/persons — admin: list all persons */
router.get('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const snap = await admin.database().ref('persons').get();
    const persons = snap.val() || {};
    res.json(Object.entries(persons).map(([id, p]) => ({ id, ...p })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/persons — admin: create a new person (also creates Firebase Auth user)
 * Body: { email, password, name, contact, houseIds?: [houseId, ...] }
 */
router.post('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email, password, name, contact, houseIds = [] } = req.body || {};
    if (!email || !password || !name || !contact) {
      return res.status(400).json({ error: 'email, password, name, contact required' });
    }

    const userRecord = await admin.auth().createUser({
      email, password, displayName: name,
      phoneNumber: contact.startsWith('+') ? contact : undefined,
    });

    const db = admin.database();
    const now = Date.now();
    const personId = userRecord.uid;
    const houseIdsMap = {};
    for (const h of houseIds) houseIdsMap[h] = true;

    const updates = {};
    updates[`persons/${personId}`] = {
      name, email, contact, role: 'user', houseIds: houseIdsMap, createdAt: now,
    };
    // Mirror into each house's contactPersons
    for (const houseId of houseIds) {
      updates[`houses/${houseId}/contactPersons/${personId}`] = true;
    }
    await db.ref().update(updates);

    res.json({ id: personId, name, email, contact });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(err);
  }
});

/** PATCH /api/persons/:id — admin: update name/contact/email */
router.patch('/:id', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, contact, email } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name;
    if (contact !== undefined) update.contact = contact;
    if (email !== undefined) {
      update.email = email;
      // Also update Firebase Auth email
      await admin.auth().updateUser(id, { email, displayName: name });
    } else if (name !== undefined) {
      await admin.auth().updateUser(id, { displayName: name });
    }
    await admin.database().ref(`persons/${id}`).update(update);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/persons/:id — admin: remove person, auth account, and unlink from all houses */
router.delete('/:id', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const personSnap = await admin.database().ref(`persons/${id}`).get();
    const houseIds = Object.keys(personSnap.val()?.houseIds || {});

    await admin.auth().deleteUser(id).catch(() => {});

    const updates = { [`persons/${id}`]: null };
    for (const hid of houseIds) {
      updates[`houses/${hid}/contactPersons/${id}`] = null;
    }
    await admin.database().ref().update(updates);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
