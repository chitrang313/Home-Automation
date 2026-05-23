/**
 * Houses routes — Firestore-backed.
 *
 *   houses/{houseId}
 *     name, location, createdAt, contactPersons
 *
 *     rooms/{roomId}
 *       name, floor, createdAt
 *
 *       boards/{boardId}
 *         deviceId, label, relayCount (4|8), lastDownloadAt, firmwareNeedsUpdate
 *
 *       appliances/{applianceId}
 *         name, icon, type, boardId, relaySlot, switchType, createdAt
 *
 * Live relay state lives in RTDB at /devices/{deviceId}/relays/relay1..relay8.
 * That is the ONLY data still in RTDB — everything else is Firestore.
 */
const express = require('express');
const { admin } = require('../firebase-admin');
const { verifyAuth, requireAdmin } = require('../middleware/auth');
const {
  serializeDoc,
  serializeSnapshot,
  personRef,
  houseRef,
  roomRef,
  boardRef,
  applianceRef,
  canAccessHouse,
  deleteRecursive,
} = require('../utils/firestore-helpers');

const router = express.Router();

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_RELAYS_PER_BOARD = 8;
const RELAY_SLOTS_4 = ['relay1', 'relay2', 'relay3', 'relay4'];
const RELAY_SLOTS_8 = [
  'relay1', 'relay2', 'relay3', 'relay4',
  'relay5', 'relay6', 'relay7', 'relay8',
];

/** Choose board capacity from current appliance count on that board. */
function relayCountFor(applianceCount) {
  if (applianceCount <= 4) return 4;
  if (applianceCount <= 8) return 8;
  // > 8 cannot fit on a single ESP32 — caller is expected to reject before this.
  return 8;
}

/**
 * Reconcile board.relayCount + firmwareNeedsUpdate after appliance changes.
 *
 * Call this whenever a board's appliance set changes (add / remove / move /
 * switchType change). It walks the board's appliance subcollection, counts,
 * and writes a minimal patch.
 *
 * @returns the updated board document data
 */
async function reconcileBoard(houseId, roomId, boardId, options = {}) {
  const { forceFirmwareUpdate = true } = options;
  const db = admin.firestore();

  // Count appliances currently linked to this board.
  const appliancesSnap = await roomRef(houseId, roomId)
    .collection('appliances')
    .where('boardId', '==', boardId)
    .get();
  const count = appliancesSnap.size;

  const newRelayCount = relayCountFor(count);

  const updates = { relayCount: newRelayCount };
  if (forceFirmwareUpdate) updates.firmwareNeedsUpdate = true;

  await boardRef(houseId, roomId, boardId).set(updates, { merge: true });
  return updates;
}

/**
 * Initialise the RTDB relay state nodes for a board (all false).
 * Idempotent — Firebase set() overwrites only the keys we provide.
 */
async function initBoardRtdbState(deviceId, relayCount = MAX_RELAYS_PER_BOARD) {
  const slots = relayCount >= 8 ? RELAY_SLOTS_8 : RELAY_SLOTS_4;
  const payload = Object.fromEntries(slots.map((slot) => [slot, false]));
  await admin.database().ref(`devices/${deviceId}/relays`).set(payload);
}

/** Remove the entire RTDB branch for a board's device (no orphan state left). */
async function removeBoardRtdbState(deviceId) {
  if (!deviceId) return;
  await admin.database().ref(`devices/${deviceId}`).remove();
}

// ═══════════════════════════════════════════════════════════════════════════
//   HOUSES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/houses
 * Admin sees every house. A regular user sees only their linked houses.
 */
router.get('/', verifyAuth, async (req, res, next) => {
  try {
    const db = admin.firestore();
    if (req.user.admin) {
      const snap = await db.collection('houses').get();
      return res.json(serializeSnapshot(snap));
    }

    // Non-admin: look up their houseIds map and fetch only those.
    const personSnap = await personRef(req.user.uid).get();
    const linkedIds = Object.keys(personSnap.data()?.houseIds || {});
    if (linkedIds.length === 0) return res.json([]);

    // Firestore `in` query supports up to 30 IDs per call — chunk if needed.
    const chunks = [];
    for (let i = 0; i < linkedIds.length; i += 30) {
      chunks.push(linkedIds.slice(i, i + 30));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        db
          .collection('houses')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get()
      )
    );
    const all = results.flatMap((s) => serializeSnapshot(s));
    res.json(all);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/houses/:houseId
 * Returns the house document. Use /rooms + /appliances endpoints for children.
 */
router.get('/:houseId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const snap = await houseRef(houseId).get();
    if (!snap.exists) return res.status(404).json({ error: 'House not found' });
    res.json(serializeDoc(snap));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/houses
 * Admin-only: create a house, optionally pre-linked to contact persons.
 * Body: { name, location?, contactPersonIds?: string[] }
 */
router.post('/', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, location = '', contactPersonIds = [] } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    const db = admin.firestore();
    const batch = db.batch();
    const newHouseRef = db.collection('houses').doc(); // auto-generated ID
    const houseId = newHouseRef.id;
    const now = Date.now();
    const contactPersonsMap = Object.fromEntries(
      contactPersonIds.map((p) => [p, true])
    );

    batch.set(newHouseRef, {
      name,
      location,
      contactPersons: contactPersonsMap,
      createdAt: now,
    });
    // Mirror into each contact-person's houseIds.
    for (const pid of contactPersonIds) {
      batch.set(
        personRef(pid),
        { houseIds: { [houseId]: true } },
        { merge: true }
      );
    }
    await batch.commit();
    res.json({ id: houseId, name, location });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/houses/:houseId — house members or admin update name/location. */
router.patch('/:houseId', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const update = {};
    for (const k of ['name', 'location']) {
      if (k in req.body) update[k] = req.body[k];
    }
    await houseRef(houseId).set(update, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/houses/:houseId
 * Admin-only: deletes the house, EVERY subcollection under it, removes the
 * house key from every linked person, AND removes every linked board's RTDB
 * relay state so no orphan data is left behind.
 */
router.delete('/:houseId', verifyAuth, requireAdmin, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    const db = admin.firestore();

    // 1. Collect every board's deviceId so we can clean RTDB after Firestore.
    const roomsSnap = await houseRef(houseId).collection('rooms').get();
    const deviceIds = [];
    for (const room of roomsSnap.docs) {
      const boardsSnap = await room.ref.collection('boards').get();
      boardsSnap.forEach((b) => {
        const did = b.data()?.deviceId;
        if (did) deviceIds.push(did);
      });
    }

    // 2. Collect contactPersons for unlinking.
    const houseDoc = await houseRef(houseId).get();
    const linkedPersonIds = Object.keys(houseDoc.data()?.contactPersons || {});

    // 3. Recursive Firestore delete (house + rooms + boards + appliances).
    await deleteRecursive(houseRef(houseId));

    // 4. Unlink the house from each person's houseIds map.
    const batch = db.batch();
    for (const pid of linkedPersonIds) {
      batch.update(personRef(pid), {
        [`houseIds.${houseId}`]: admin.firestore.FieldValue.delete(),
      });
    }
    if (linkedPersonIds.length) await batch.commit();

    // 5. Wipe RTDB device branches for every board that lived in this house.
    await Promise.all(deviceIds.map(removeBoardRtdbState));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PERSON ↔ HOUSE LINKING ─────────────────────────────────────────────────

/** PUT /api/houses/:houseId/persons/:personId — admin links. */
router.put(
  '/:houseId/persons/:personId',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, personId } = req.params;
      const db = admin.firestore();
      const batch = db.batch();
      batch.set(
        houseRef(houseId),
        { contactPersons: { [personId]: true } },
        { merge: true }
      );
      batch.set(
        personRef(personId),
        { houseIds: { [houseId]: true } },
        { merge: true }
      );
      await batch.commit();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/** DELETE /api/houses/:houseId/persons/:personId — admin unlinks. */
router.delete(
  '/:houseId/persons/:personId',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, personId } = req.params;
      const db = admin.firestore();
      const batch = db.batch();
      batch.update(houseRef(houseId), {
        [`contactPersons.${personId}`]: admin.firestore.FieldValue.delete(),
      });
      batch.update(personRef(personId), {
        [`houseIds.${houseId}`]: admin.firestore.FieldValue.delete(),
      });
      await batch.commit();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
//   ROOMS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/houses/:houseId/rooms — list rooms. */
router.get('/:houseId/rooms', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const snap = await houseRef(houseId).collection('rooms').get();
    res.json(serializeSnapshot(snap));
  } catch (err) {
    next(err);
  }
});

/** POST /api/houses/:houseId/rooms — create. */
router.post('/:houseId/rooms', verifyAuth, async (req, res, next) => {
  try {
    const { houseId } = req.params;
    if (!(await canAccessHouse(req, houseId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, floor = '' } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    const newRoom = houseRef(houseId).collection('rooms').doc();
    await newRoom.set({ name, floor, createdAt: Date.now() });
    res.json({ id: newRoom.id, name, floor });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/houses/:houseId/rooms/:roomId */
router.patch(
  '/:houseId/rooms/:roomId',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const update = {};
      for (const k of ['name', 'floor']) {
        if (k in req.body) update[k] = req.body[k];
      }
      await roomRef(houseId, roomId).set(update, { merge: true });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/houses/:houseId/rooms/:roomId
 * Recursively deletes rooms + their boards + appliances. Also wipes RTDB
 * state for every board that lived under the room.
 */
router.delete(
  '/:houseId/rooms/:roomId',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Collect deviceIds before deletion so we can clean RTDB after.
      const boardsSnap = await roomRef(houseId, roomId).collection('boards').get();
      const deviceIds = boardsSnap.docs
        .map((b) => b.data()?.deviceId)
        .filter(Boolean);

      await deleteRecursive(roomRef(houseId, roomId));
      await Promise.all(deviceIds.map(removeBoardRtdbState));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
//   BOARDS  (one ESP32 = one Board)
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/houses/:houseId/rooms/:roomId/boards */
router.get(
  '/:houseId/rooms/:roomId/boards',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const snap = await roomRef(houseId, roomId).collection('boards').get();
      res.json(serializeSnapshot(snap));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/houses/:houseId/rooms/:roomId/boards
 *
 * Creates a new Board. The deviceId is the Firestore-generated document ID —
 * stable forever, never changes even on firmware re-download. Also seeds the
 * RTDB relay state with 4 booleans set to false (admin can re-trigger 8-ch
 * later by adding more appliances).
 *
 * Body: { label?: "Board 1" }   (label is admin-facing; auto-generated if missing)
 */
router.post(
  '/:houseId/rooms/:roomId/boards',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      const { label } = req.body || {};

      // Auto-label: "Board N" where N = (existing board count + 1)
      const existing = await roomRef(houseId, roomId).collection('boards').get();
      const autoLabel = label || `Board ${existing.size + 1}`;

      const newBoard = roomRef(houseId, roomId).collection('boards').doc();
      const deviceId = newBoard.id;
      const now = Date.now();

      const boardData = {
        deviceId,
        label: autoLabel,
        relayCount: 4,         // starts as 4-channel; auto-bumps to 8 if >4 appliances
        lastDownloadAt: null,  // until admin downloads firmware
        firmwareNeedsUpdate: false,
        createdAt: now,
      };
      await newBoard.set(boardData);

      // Seed RTDB so the dashboard can show "OFF" cards before the ESP32 boots.
      await initBoardRtdbState(deviceId, 4);

      res.json({ id: deviceId, ...boardData });
    } catch (err) {
      next(err);
    }
  }
);

/** PATCH board — admin updates label. */
router.patch(
  '/:houseId/rooms/:roomId/boards/:boardId',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, roomId, boardId } = req.params;
      const update = {};
      if ('label' in req.body) update.label = req.body.label;
      await boardRef(houseId, roomId, boardId).set(update, { merge: true });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE board — also frees all appliances on this board (sets boardId=null
 * and relaySlot=null so they can be reassigned), and wipes RTDB state.
 */
router.delete(
  '/:houseId/rooms/:roomId/boards/:boardId',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, roomId, boardId } = req.params;
      const board = await boardRef(houseId, roomId, boardId).get();
      if (!board.exists) {
        return res.status(404).json({ error: 'Board not found' });
      }
      const deviceId = board.data().deviceId;

      // Detach appliances on this board.
      const appliancesSnap = await roomRef(houseId, roomId)
        .collection('appliances')
        .where('boardId', '==', boardId)
        .get();
      const batch = admin.firestore().batch();
      appliancesSnap.forEach((d) => {
        batch.update(d.ref, { boardId: null, relaySlot: null });
      });
      batch.delete(boardRef(houseId, roomId, boardId));
      await batch.commit();

      await removeBoardRtdbState(deviceId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
//   APPLIANCES
// ═══════════════════════════════════════════════════════════════════════════

/** GET appliances of a room */
router.get(
  '/:houseId/rooms/:roomId/appliances',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const snap = await roomRef(houseId, roomId).collection('appliances').get();
      res.json(serializeSnapshot(snap));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/houses/:houseId/rooms/:roomId/appliances
 *
 * Create an appliance. If boardId+relaySlot are not provided, auto-assigns
 * the first board with a free slot (creating a new board if none have room).
 *
 * Body: { name, type, icon?, switchType?, boardId?, relaySlot? }
 *
 * - name        required, display label (renameable)
 * - type        required, functional category (fan/light/ac/geyser/...)
 * - icon        defaults to type
 * - switchType  "touch" (default) | "click" | "none"
 * - boardId     optional — auto-picked if omitted
 * - relaySlot   optional — auto-picked if omitted
 */
router.post(
  '/:houseId/rooms/:roomId/appliances',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, roomId } = req.params;
      const {
        name,
        type,
        icon,
        switchType = 'touch',
        boardId: explicitBoardId,
        relaySlot: explicitRelaySlot,
      } = req.body || {};
      if (!name || !type) {
        return res.status(400).json({ error: 'name and type required' });
      }
      if (!['touch', 'click', 'none'].includes(switchType)) {
        return res.status(400).json({ error: 'switchType must be touch | click | none' });
      }

      // ─── Slot auto-assignment ────────────────────────────────────────
      // Strategy:
      //   1. If admin supplied boardId+relaySlot, validate availability.
      //   2. Otherwise scan existing boards for a free slot.
      //   3. If every board is full (or no boards exist), create a new
      //      board and place the appliance on relay1.
      const boardsSnap = await roomRef(houseId, roomId).collection('boards').get();
      const appliancesSnap = await roomRef(houseId, roomId)
        .collection('appliances')
        .get();
      const occupied = {}; // boardId -> Set<relaySlot>
      appliancesSnap.forEach((d) => {
        const a = d.data();
        if (!a.boardId || !a.relaySlot) return;
        (occupied[a.boardId] ||= new Set()).add(a.relaySlot);
      });

      let chosenBoardId = null;
      let chosenSlot = null;

      if (explicitBoardId && explicitRelaySlot) {
        // Explicit placement — verify slot is free
        if (occupied[explicitBoardId]?.has(explicitRelaySlot)) {
          return res.status(409).json({ error: `Slot ${explicitRelaySlot} already in use` });
        }
        chosenBoardId = explicitBoardId;
        chosenSlot = explicitRelaySlot;
      } else {
        // Auto-pick
        for (const boardDoc of boardsSnap.docs) {
          const bid = boardDoc.id;
          const used = occupied[bid] || new Set();
          const slot = RELAY_SLOTS_8.find((s) => !used.has(s));
          if (slot) {
            chosenBoardId = bid;
            chosenSlot = slot;
            break;
          }
        }
      }

      // No board with room → auto-create a new one.
      if (!chosenBoardId) {
        const newBoard = roomRef(houseId, roomId).collection('boards').doc();
        const deviceId = newBoard.id;
        const autoLabel = `Board ${boardsSnap.size + 1}`;
        await newBoard.set({
          deviceId,
          label: autoLabel,
          relayCount: 4,
          lastDownloadAt: null,
          firmwareNeedsUpdate: false,
          createdAt: Date.now(),
        });
        await initBoardRtdbState(deviceId, 4);
        chosenBoardId = deviceId;
        chosenSlot = 'relay1';
      }

      // ─── Persist the appliance ───────────────────────────────────────
      const newAppliance = roomRef(houseId, roomId).collection('appliances').doc();
      const applianceData = {
        name,
        type,
        icon: icon || type,
        switchType,
        boardId: chosenBoardId,
        relaySlot: chosenSlot,
        createdAt: Date.now(),
      };
      await newAppliance.set(applianceData);

      // Auto-recompute board.relayCount + flag firmware update
      await reconcileBoard(houseId, roomId, chosenBoardId);

      res.json({ id: newAppliance.id, ...applianceData });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH appliance
 *
 * Permission model:
 *   - Any house member can change `name` and `icon` (cosmetic, never breaks
 *     the relay wiring).
 *   - Only admin can change `type`, `boardId`, `relaySlot`, `switchType`.
 *
 * When relaySlot / switchType / boardId changes, we set
 * board.firmwareNeedsUpdate=true so the dashboard shows a "Re-flash" badge.
 */
router.patch(
  '/:houseId/rooms/:roomId/appliances/:applianceId',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId, applianceId } = req.params;
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const existingSnap = await applianceRef(houseId, roomId, applianceId).get();
      if (!existingSnap.exists) {
        return res.status(404).json({ error: 'Appliance not found' });
      }
      const existing = existingSnap.data();

      // Pull body and split into "cosmetic" (anyone) vs "structural" (admin only)
      const { name, icon, type, boardId, relaySlot, switchType } = req.body || {};

      const cosmetic = {};
      if (name !== undefined) cosmetic.name = name;
      if (icon !== undefined) cosmetic.icon = icon;

      const structural = {};
      if (type !== undefined) structural.type = type;
      if (boardId !== undefined) structural.boardId = boardId;
      if (relaySlot !== undefined) structural.relaySlot = relaySlot;
      if (switchType !== undefined) {
        if (!['touch', 'click', 'none'].includes(switchType)) {
          return res.status(400).json({ error: 'switchType must be touch | click | none' });
        }
        structural.switchType = switchType;
      }

      if (Object.keys(structural).length && !req.user.admin) {
        return res
          .status(403)
          .json({ error: 'Only admin can change relay slot, board, type or switch type' });
      }

      // If a slot is being re-assigned, verify the new slot is free on the
      // chosen board (or remains the appliance's own existing slot).
      const finalBoardId = structural.boardId ?? existing.boardId;
      const finalRelaySlot = structural.relaySlot ?? existing.relaySlot;
      if (
        ('boardId' in structural || 'relaySlot' in structural) &&
        finalBoardId &&
        finalRelaySlot
      ) {
        const conflict = await roomRef(houseId, roomId)
          .collection('appliances')
          .where('boardId', '==', finalBoardId)
          .where('relaySlot', '==', finalRelaySlot)
          .get();
        const otherUsers = conflict.docs.filter((d) => d.id !== applianceId);
        if (otherUsers.length) {
          return res
            .status(409)
            .json({ error: `Slot ${finalRelaySlot} already in use on this board` });
        }
      }

      await applianceRef(houseId, roomId, applianceId).set(
        { ...cosmetic, ...structural },
        { merge: true }
      );

      // Reconcile affected boards (could be 1 or 2 if the appliance moved)
      const affectedBoards = new Set();
      if (existing.boardId) affectedBoards.add(existing.boardId);
      if (finalBoardId) affectedBoards.add(finalBoardId);
      const needsFirmwareUpdate =
        'boardId' in structural ||
        'relaySlot' in structural ||
        'switchType' in structural;
      await Promise.all(
        Array.from(affectedBoards).map((bid) =>
          reconcileBoard(houseId, roomId, bid, {
            forceFirmwareUpdate: needsFirmwareUpdate,
          })
        )
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/** DELETE appliance — also reconciles the board's relayCount + firmware flag. */
router.delete(
  '/:houseId/rooms/:roomId/appliances/:applianceId',
  verifyAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { houseId, roomId, applianceId } = req.params;
      const snap = await applianceRef(houseId, roomId, applianceId).get();
      if (!snap.exists) return res.json({ ok: true });
      const { boardId } = snap.data();

      await applianceRef(houseId, roomId, applianceId).delete();
      if (boardId) {
        await reconcileBoard(houseId, roomId, boardId);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
