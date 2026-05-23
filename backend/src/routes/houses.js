const express = require('express');
const { admin } = require('../firebase-admin');
const { verifyAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

/** Check whether req.user is admin OR a contactPerson of the house */
async function canAccessHouse(req, houseId) {
  if (req.user.admin) return true;
  const snap = await admin.database().ref(`houses/${houseId}/contactPersons/${req.user.uid}`).get();
  return snap.val() === true;
}

/** GET /api/houses — admin lists all, user lists only their linked houses */
router.get('/', verifyAuth, async (req, res, next) => {
  try {
    const db = admin.database();
    if (req.user.admin) {
      const snap = await db.ref('houses').get();
      const houses = snap.val() || {};
      res.json(Object.entries(houses).map(([id, h]) => ({ id, ...h })));
    } else {
      // Find houseIds from the person record
      const psnap = await db.ref(`persons/${req.user.uid}/houseIds`).get();
      const houseIds = Object.keys(psnap.val() || {});
      const houses = await Promise.all(houseIds.map(async (hid) => {
        const hsnap = await db.ref(`houses/${hid}`).get();
        return hsnap.exists() ? { id: hid, ...hsnap.val() } : null;
      }));
      res.json(houses.filter(Boolean));
    }
  } catch (err) {
    next(err);
  }
});

/** GET /api/houses/:houseId — full house with rooms+appliances */
router.get('/:houseId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const snap = await admin.database().ref(`houses/${houseId}`).get();
    if (!snap.exists()) return res.status(404).json({ error: 'House not found' });
    res.json({ id: houseId, ...snap.val() });
  } catch (err) {
    next(err);
  }
});

/** POST /api/houses — admin: create a house (optionally with initial contact persons) */
router.post('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, location = '', contactPersonIds = [] } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    const db = admin.database();
    const houseRef = db.ref('houses').push();
    const houseId = houseRef.key;
    const now = Date.now();
    const contactPersonsMap = {};
    for (const pid of contactPersonIds) contactPersonsMap[pid] = true;

    const updates = {};
    updates[`houses/${houseId}`] = { name, location, contactPersons: contactPersonsMap, createdAt: now };
    for (const pid of contactPersonIds) {
      updates[`persons/${pid}/houseIds/${houseId}`] = true;
    }
    await db.ref().update(updates);
    res.json({ id: houseId, name, location });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/houses/:houseId — admin or contactPerson edits metadata */
router.patch('/:houseId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const allowed = ['name', 'location'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    await admin.database().ref(`houses/${houseId}`).update(update);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/houses/:houseId — admin: remove house and unlink from all contactPersons */
router.delete('/:houseId', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    const snap = await admin.database().ref(`houses/${houseId}/contactPersons`).get();
    const personIds = Object.keys(snap.val() || {});

    const updates = { [`houses/${houseId}`]: null };
    for (const pid of personIds) {
      updates[`persons/${pid}/houseIds/${houseId}`] = null;
    }
    await admin.database().ref().update(updates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── LINK / UNLINK person ↔ house ─────────────────────────────────────────────

/** PUT /api/houses/:houseId/persons/:personId — admin links person to house */
router.put('/:houseId/persons/:personId', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { houseId, personId } = req.params;
    const updates = {
      [`houses/${houseId}/contactPersons/${personId}`]: true,
      [`persons/${personId}/houseIds/${houseId}`]: true,
    };
    await admin.database().ref().update(updates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/houses/:houseId/persons/:personId — admin unlinks */
router.delete('/:houseId/persons/:personId', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { houseId, personId } = req.params;
    const updates = {
      [`houses/${houseId}/contactPersons/${personId}`]: null,
      [`persons/${personId}/houseIds/${houseId}`]: null,
    };
    await admin.database().ref().update(updates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── ROOMS ─────────────────────────────────────────────────────────────────────

router.post('/:houseId/rooms', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const { name, order = 0 } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const ref = admin.database().ref(`houses/${houseId}/rooms`).push();
    await ref.set({ name, order });
    res.json({ id: ref.key, name, order });
  } catch (err) { next(err); }
});

router.patch('/:houseId/rooms/:roomId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId, roomId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const update = {};
    for (const k of ['name', 'order']) if (k in req.body) update[k] = req.body[k];
    await admin.database().ref(`houses/${houseId}/rooms/${roomId}`).update(update);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:houseId/rooms/:roomId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId, roomId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    await admin.database().ref(`houses/${houseId}/rooms/${roomId}`).remove();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── APPLIANCES ────────────────────────────────────────────────────────────────

router.post('/:houseId/rooms/:roomId/appliances', verifyAuth, async (req, res, next) => {
  try {
    const { houseId, roomId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const { name, icon = 'bulb', relayPath } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    // Push generates a unique key first; then we use it to auto-build a unique
    // relayPath if the caller didn't supply one. This guarantees no two appliances
    // ever share the same Firebase node.
    const ref = admin.database().ref(`houses/${houseId}/rooms/${roomId}/appliances`).push();
    const applianceId = ref.key;
    const finalRelayPath = relayPath || `/houses/${houseId}/relays/${applianceId}`;

    await ref.set({ name, icon, relayPath: finalRelayPath });
    res.json({ id: applianceId, name, icon, relayPath: finalRelayPath });
  } catch (err) { next(err); }
});

router.patch('/:houseId/rooms/:roomId/appliances/:applianceId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId, roomId, applianceId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    const update = {};
    for (const k of ['name', 'icon', 'relayPath']) if (k in req.body) update[k] = req.body[k];
    await admin.database().ref(`houses/${houseId}/rooms/${roomId}/appliances/${applianceId}`).update(update);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:houseId/rooms/:roomId/appliances/:applianceId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId, roomId, applianceId } = req.params;
    if (!(await canAccessHouse(req, houseId))) return res.status(403).json({ error: 'Forbidden' });
    await admin.database().ref(`houses/${houseId}/rooms/${roomId}/appliances/${applianceId}`).remove();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
