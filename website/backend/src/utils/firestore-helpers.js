/**
 * Firestore helper utilities — keep route code clean and consistent.
 */
const { admin, getFirestore } = require('../firebase-admin');

/**
 * Convert a Firestore DocumentSnapshot into a plain object.
 * - Adds `id` (document ID)
 * - Converts any Firestore Timestamp fields to epoch milliseconds
 *   (so the frontend never has to deal with Timestamp objects)
 */
function serializeDoc(doc) {
  if (!doc || !doc.exists) return null;
  const data = doc.data() || {};
  const out = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toMillis === 'function') {
      out[k] = v.toMillis();
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Convert a QuerySnapshot into a serialized array. */
function serializeSnapshot(snapshot) {
  return snapshot.docs.map(serializeDoc);
}

// ─── Document-reference shortcuts ──────────────────────────────────────────
// Centralised so route files never hand-stitch collection paths.

function personRef(uid) {
  return getFirestore().collection('persons').doc(uid);
}

function houseRef(houseId) {
  return getFirestore().collection('houses').doc(houseId);
}

function roomRef(houseId, roomId) {
  return houseRef(houseId).collection('rooms').doc(roomId);
}

function boardRef(houseId, roomId, boardId) {
  return roomRef(houseId, roomId).collection('boards').doc(boardId);
}

function applianceRef(houseId, roomId, applianceId) {
  return roomRef(houseId, roomId).collection('appliances').doc(applianceId);
}

// ─── Access-control predicates ─────────────────────────────────────────────

/**
 * True if the authenticated user is an admin OR a listed contactPerson of the house.
 * Throws nothing — pure boolean. Caller decides the response.
 */
async function canAccessHouse(req, houseId) {
  if (req.user?.admin) return true;
  const doc = await houseRef(houseId).get();
  if (!doc.exists) return false;
  const contactPersons = doc.data().contactPersons || {};
  return contactPersons[req.user.uid] === true;
}

// ─── Recursive deletion helpers ────────────────────────────────────────────

/**
 * Delete a document AND every document in every subcollection underneath it.
 * Uses admin SDK's recursiveDelete (efficient, server-side).
 */
async function deleteRecursive(docRef) {
  await getFirestore().recursiveDelete(docRef);
}

module.exports = {
  serializeDoc,
  serializeSnapshot,
  personRef,
  houseRef,
  roomRef,
  boardRef,
  applianceRef,
  canAccessHouse,
  deleteRecursive,
  admin,
};
