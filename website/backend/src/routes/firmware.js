/**
 * Firmware download route — generates the .ino tied to one specific Board.
 *
 * GET /api/houses/:houseId/rooms/:roomId/boards/:boardId/firmware
 *
 *   Query string (or body for POST variant):
 *     ssid     Wi-Fi SSID to embed
 *     pass     Wi-Fi password to embed
 *
 *   Response:
 *     Content-Type: text/plain; charset=utf-8
 *     Content-Disposition: attachment; filename="House_Room_Board1.ino"
 *     <generated .ino source>
 *
 *   Side effects on success:
 *     - board.lastDownloadAt   ← now
 *     - board.firmwareNeedsUpdate ← false  (re-flash badge clears)
 *     - RTDB /devices/{deviceId}/relays/relay1..N ← false (seeds new slots)
 *
 * Auth model:
 *   Any house member can download (so a homeowner can re-flash their own
 *   ESP32 after a Wi-Fi password change). Only admin can change relay slots,
 *   switch types, etc. — so what gets generated is always admin-approved.
 */
const express = require('express');
const JSZip = require('jszip');
const { admin } = require('../firebase-admin');
const { verifyAuth } = require('../middleware/auth');
const {
  houseRef,
  roomRef,
  boardRef,
  canAccessHouse,
} = require('../utils/firestore-helpers');
const {
  generateIno,
  buildFilename,
} = require('../utils/firmware-generator');

const router = express.Router({ mergeParams: true });

/**
 * Returns the Firebase config the generated .ino needs to authenticate.
 *
 * apiKey + databaseUrl come from backend env (never the repo / frontend
 * bundle). The device login (USER_EMAIL / USER_PASSWORD the ESP32 signs in
 * with) is chosen at download time:
 *
 *   - If the caller supplies userEmail + userPassword (entered in the
 *     download dialog — typically the logged-in user's own Firebase
 *     account), those are embedded.
 *   - Otherwise we fall back to a dedicated device service account from
 *     env (ESP32_DEVICE_EMAIL / ESP32_DEVICE_PASSWORD), if configured.
 *
 * The supplied password is used only to template this one file in memory —
 * it is never stored in Firestore/RTDB and never logged.
 */
function getFirebaseConfigForFirmware({ userEmail, userPassword } = {}) {
  return {
    apiKey:       process.env.FIREBASE_WEB_API_KEY || '',
    databaseUrl:  process.env.DATABASE_URL         || '',
    userEmail:    userEmail    || process.env.ESP32_DEVICE_EMAIL    || '',
    userPassword: userPassword || process.env.ESP32_DEVICE_PASSWORD || '',
  };
}

/**
 * POST so Wi-Fi + Firebase credentials travel in the request body, never in
 * the URL (which would land in browser history and server access logs).
 *
 * Body: { ssid, pass, userEmail?, userPassword? }
 *   - ssid / pass         Wi-Fi network + password to embed
 *   - userEmail/Password  Firebase account the ESP32 signs in as (optional;
 *                         falls back to the env device account)
 */
router.post(
  '/:houseId/rooms/:roomId/boards/:boardId/firmware',
  verifyAuth,
  async (req, res, next) => {
    try {
      const { houseId, roomId, boardId } = req.params;
      const { ssid, pass, userEmail, userPassword } = req.body || {};

      if (!ssid || !pass) {
        return res
          .status(400)
          .json({ error: 'ssid and pass are required' });
      }
      if (!(await canAccessHouse(req, houseId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // ─── Gather everything the template needs ────────────────────────
      const [houseSnap, roomSnap, boardSnap, appliancesSnap] = await Promise.all([
        houseRef(houseId).get(),
        roomRef(houseId, roomId).get(),
        boardRef(houseId, roomId, boardId).get(),
        roomRef(houseId, roomId)
          .collection('appliances')
          .where('boardId', '==', boardId)
          .get(),
      ]);

      if (!houseSnap.exists) return res.status(404).json({ error: 'House not found' });
      if (!roomSnap.exists)  return res.status(404).json({ error: 'Room not found' });
      if (!boardSnap.exists) return res.status(404).json({ error: 'Board not found' });

      const house = houseSnap.data();
      const room  = roomSnap.data();
      const board = boardSnap.data();
      const appliances = appliancesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Resolve the contact-person display names (skip if missing).
      const contactIds = Object.keys(house.contactPersons || {});
      const persons = (
        await Promise.all(
          contactIds.map((pid) =>
            admin.firestore().collection('persons').doc(pid).get()
          )
        )
      )
        .filter((s) => s.exists)
        .map((s) => ({ name: s.data().name || s.data().email || '(unnamed)' }));

      // ─── Generate ─────────────────────────────────────────────────────
      const source = generateIno({
        house: { name: house.name, location: house.location },
        room:  { name: room.name,  floor: room.floor },
        board: { deviceId: board.deviceId, label: board.label, relayCount: board.relayCount || 0 },
        persons,
        appliances,
        wifi: { ssid, password: pass },
        firebase: getFirebaseConfigForFirmware({ userEmail, userPassword }),
      });

      // ─── Seed RTDB relay state (idempotent) ───────────────────────────
      // Ensures dashboards can show OFF cards before the ESP32 has booted.
      // Seed exactly the slots this board's appliances occupy (relays can be
      // on any of the 16 GPIOs now), only filling nodes that don't exist yet.
      const slots = appliances.map((a) => a.relaySlot).filter(Boolean);
      const existing = await admin.database().ref(`devices/${board.deviceId}/relays`).get();
      const existingVal = existing.val() || {};
      const patch = {};
      for (const s of slots) if (existingVal[s] === undefined) patch[s] = false;
      if (Object.keys(patch).length) {
        await admin.database().ref(`devices/${board.deviceId}/relays`).update(patch);
      }

      // ─── Mark this board as freshly downloaded ────────────────────────
      // Persist the Wi-Fi SSID so the next download prefills it. The Wi-Fi
      // PASSWORD is never stored (it's only used to template this file) —
      // it must be re-entered each time.
      await boardRef(houseId, roomId, boardId).set(
        { lastDownloadAt: Date.now(), firmwareNeedsUpdate: false, wifiSsid: ssid },
        { merge: true }
      );

      // ─── Send as a .zip (sketch folder + matching .ino inside) ─────────
      // buildFilename returns "{stem}/{stem}.ino"; the zip is "{stem}.zip"
      // containing a "{stem}/" folder with "{stem}.ino" — drops straight into
      // the Arduino IDE (which needs a sketch in a folder of the same name).
      // Only when the room holds more than one board do we append the board
      // label, so two boards in the same room can't collide.
      const roomBoardCount = await roomRef(houseId, roomId)
        .collection('boards')
        .get()
        .then((s) => s.size);
      const inoPath = buildFilename(house, room, board, {
        disambiguate: roomBoardCount > 1,
      });                                   // e.g. "GaneshKrupa_Hall/GaneshKrupa_Hall.ino"
      const stem = inoPath.split('/')[0];   // e.g. "GaneshKrupa_Hall"
      const zipName = `${stem}.zip`;

      const zip = new JSZip();
      zip.file(inoPath, source);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
