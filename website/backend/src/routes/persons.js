/**
 * Persons routes — Firestore-backed.
 *
 * Schema: persons/{uid}
 *   - name        string
 *   - email       string
 *   - contact     string (not exposed publicly to non-self/non-admin)
 *   - role        "user" | "admin"
 *   - houseIds    map<houseId, true>     reverse-index for fast membership check
 *   - createdAt   number (epoch ms)
 *
 * Document ID is the Firebase Auth UID.
 */
const express = require('express');
const { admin } = require('../firebase-admin');
const { verifyAuth, requireAdmin } = require('../middleware/auth');
const {
  serializeDoc,
  serializeSnapshot,
  personRef,
  houseRef,
} = require('../utils/firestore-helpers');

const router = express.Router();

/**
 * GET /api/persons/me
 *
 * Returns the current user's person profile.
 *
 * Two self-heal behaviours run on every call:
 *
 * 1. Admin claim self-heal — if the caller's email matches ADMIN_EMAIL but
 *    the Firebase custom claim is missing (first login, token was cleared,
 *    etc.) we re-grant it and set tokenRefreshNeeded so the client pulls a
 *    fresh token before hitting any admin route.
 *
 * 2. Person-doc auto-create — if no Firestore document exists yet (e.g.
 *    first login after a migration from RTDB, or the account was created
 *    directly in the Firebase Console) we bootstrap a complete doc from
 *    the Firebase Auth user record so the frontend never sees a 404.
 */
router.get('/me', verifyAuth, async (req, res, next) => {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const myEmail   = (req.user.email || '').toLowerCase();
    const shouldBeAdmin = !!adminEmail && myEmail === adminEmail;

    let tokenRefreshNeeded = false;

    // ─── 1. Admin claim self-heal ──────────────────────────────────────
    if (shouldBeAdmin && !req.user.admin) {
      await admin.auth().setCustomUserClaims(req.user.uid, { admin: true });
      tokenRefreshNeeded = true;
    }

    // ─── 2. Read (or auto-create) the Firestore person doc ────────────
    const ref  = personRef(req.user.uid);
    let   snap = await ref.get();

    if (!snap.exists) {
      // Fetch the canonical identity from Firebase Auth so we populate
      // real display data even if the Firestore doc was never written
      // (migration from RTDB, Console-created account, etc.).
      const authUser = await admin.auth().getUser(req.user.uid);
      const now      = Date.now();

      const docData = {
        name    : authUser.displayName || (authUser.email || '').split('@')[0],
        email   : authUser.email       || '',
        contact : authUser.phoneNumber || '',
        role    : shouldBeAdmin ? 'admin' : 'user',
        houseIds: {},
        createdAt: now,
      };

      await ref.set(docData);
      snap = await ref.get(); // re-read so serializeDoc has the full doc
    } else if (shouldBeAdmin) {
      // Doc exists — make sure the role field reflects admin status.
      const data = snap.data() || {};
      if (data.role !== 'admin') {
        await ref.set({ role: 'admin' }, { merge: true });
        snap = await ref.get();
      }
    }

    res.json({
      ...serializeDoc(snap),
      admin: req.user.admin || shouldBeAdmin,
      tokenRefreshNeeded,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/persons
 * Admin-only: list every person in the system.
 */
router.get('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const snap = await admin.firestore().collection('persons').get();
    res.json(serializeSnapshot(snap));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/persons
 * Admin-only: create a Firebase Auth user + matching Firestore person doc,
 * optionally linking to existing houses in a single atomic batch.
 *
 * Body: { email, password, name, contact, houseIds?: string[] }
 */
router.post('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email, password, name, contact, houseIds = [] } = req.body || {};
    if (!email || !password || !name || !contact) {
      return res
        .status(400)
        .json({ error: 'email, password, name, contact required' });
    }

    // Step 1 — create the Firebase Auth user.
    // We do this first because if the email is already taken we want a clean
    // 409 without partial Firestore writes.
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: contact.startsWith('+') ? contact : undefined,
    });

    // Step 2 — atomic Firestore batch: write person + mirror into each
    // house's contactPersons map so list/read stays O(1).
    const db = admin.firestore();
    const batch = db.batch();
    const now = Date.now();
    const houseIdsMap = Object.fromEntries(houseIds.map((h) => [h, true]));

    batch.set(personRef(userRecord.uid), {
      name,
      email,
      contact,
      role: 'user',
      houseIds: houseIdsMap,
      createdAt: now,
    });

    for (const hid of houseIds) {
      batch.set(
        houseRef(hid),
        { contactPersons: { [userRecord.uid]: true } },
        { merge: true }
      );
    }

    await batch.commit();
    res.json({ id: userRecord.uid, name, email, contact });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(err);
  }
});

/**
 * PATCH /api/persons/:id
 * Admin-only: update name / contact / email. Mirrors changes into Firebase Auth.
 */
router.patch('/:id', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, contact, email } = req.body || {};

    const fieldsToWrite = {};
    if (name !== undefined) fieldsToWrite.name = name;
    if (contact !== undefined) fieldsToWrite.contact = contact;
    if (email !== undefined) fieldsToWrite.email = email;

    // Mirror name/email changes into Firebase Auth so the user's login still works.
    const authUpdate = {};
    if (name !== undefined) authUpdate.displayName = name;
    if (email !== undefined) authUpdate.email = email;
    if (Object.keys(authUpdate).length) {
      await admin.auth().updateUser(id, authUpdate);
    }

    if (Object.keys(fieldsToWrite).length) {
      await personRef(id).set(fieldsToWrite, { merge: true });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/persons/:id
 * Admin-only: remove auth account + Firestore doc + unlink from every house.
 */
router.delete('/:id', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = admin.firestore();

    // 1. Find every house the person is linked to so we can unlink them.
    const personSnap = await personRef(id).get();
    const linkedHouseIds = Object.keys(personSnap.data()?.houseIds || {});

    // 2. Delete the Firebase Auth user (ignore not-found — they may already
    //    have been deleted from the Auth side).
    await admin
      .auth()
      .deleteUser(id)
      .catch(() => {});

    // 3. Atomic batch: delete person doc + remove their key from each
    //    house.contactPersons map.
    const batch = db.batch();
    batch.delete(personRef(id));
    for (const hid of linkedHouseIds) {
      batch.update(houseRef(hid), {
        [`contactPersons.${id}`]: admin.firestore.FieldValue.delete(),
      });
    }
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
