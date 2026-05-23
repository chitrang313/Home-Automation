/**
 * REST client for the backend Express API.
 *
 *   Reads — many components also use the Firestore client SDK directly so
 *   they get real-time updates (see contexts/HouseContext.jsx). The REST
 *   endpoints are used where we want a one-shot fetch (e.g. admin lists).
 *
 *   Writes — always go through this client so the backend can enforce
 *   permissions + apply side effects (board reconciliation, RTDB seeding,
 *   firmware-update flag toggling).
 *
 * Every request automatically attaches a fresh Firebase ID token in the
 * Authorization header.
 */
import { auth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function authHeader() {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body, requireAuth = true, raw = false } = {}) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (requireAuth) Object.assign(headers, await authHeader());

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (raw) return res;        // caller wants full Response (e.g. firmware blob)
  if (res.status === 204) return null;
  return res.json();
}

/** Encode a query-string from an object (skips undefined / null values). */
function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // ─── Auth ─────────────────────────────────────────────────────────────
  signup: (payload) =>
    request('/auth/signup', { method: 'POST', body: payload, requireAuth: false }),

  // ─── Persons ──────────────────────────────────────────────────────────
  me:            ()                  => request('/persons/me'),
  listPersons:   ()                  => request('/persons'),
  createPerson:  (body)              => request('/persons', { method: 'POST', body }),
  updatePerson:  (id, body)          => request(`/persons/${id}`, { method: 'PATCH', body }),
  deletePerson:  (id)                => request(`/persons/${id}`, { method: 'DELETE' }),

  // ─── Houses ───────────────────────────────────────────────────────────
  listHouses:    ()                  => request('/houses'),
  getHouse:      (hid)               => request(`/houses/${hid}`),
  createHouse:   (body)              => request('/houses', { method: 'POST', body }),
  updateHouse:   (hid, body)         => request(`/houses/${hid}`, { method: 'PATCH', body }),
  deleteHouse:   (hid)               => request(`/houses/${hid}`, { method: 'DELETE' }),

  // ─── Person ↔ House linking ───────────────────────────────────────────
  linkPersonToHouse:     (hid, pid) => request(`/houses/${hid}/persons/${pid}`, { method: 'PUT' }),
  unlinkPersonFromHouse: (hid, pid) => request(`/houses/${hid}/persons/${pid}`, { method: 'DELETE' }),

  // ─── Rooms ────────────────────────────────────────────────────────────
  listRooms:   (hid)                 => request(`/houses/${hid}/rooms`),
  addRoom:     (hid, body)           => request(`/houses/${hid}/rooms`, { method: 'POST', body }),
  updateRoom:  (hid, rid, body)      => request(`/houses/${hid}/rooms/${rid}`, { method: 'PATCH', body }),
  deleteRoom:  (hid, rid)            => request(`/houses/${hid}/rooms/${rid}`, { method: 'DELETE' }),

  /**
   * Re-assigns every appliance in a room that has no board / no slot
   * (typically left behind by a board deletion) to free slots, creating
   * a new board if every existing one is full. Returns:
   *   { assigned: [{ id, boardId, relaySlot }], remaining: 0 }
   */
  autoAssignOrphans: (hid, rid) =>
    request(`/houses/${hid}/rooms/${rid}/auto-assign-orphans`, { method: 'POST' }),

  // ─── Boards (one per ESP32) ───────────────────────────────────────────
  listBoards:  (hid, rid)            => request(`/houses/${hid}/rooms/${rid}/boards`),
  addBoard:    (hid, rid, body = {}) => request(`/houses/${hid}/rooms/${rid}/boards`, { method: 'POST', body }),
  updateBoard: (hid, rid, bid, body) => request(`/houses/${hid}/rooms/${rid}/boards/${bid}`, { method: 'PATCH', body }),
  deleteBoard: (hid, rid, bid)       => request(`/houses/${hid}/rooms/${rid}/boards/${bid}`, { method: 'DELETE' }),

  // ─── Appliances ───────────────────────────────────────────────────────
  listAppliances:  (hid, rid)             => request(`/houses/${hid}/rooms/${rid}/appliances`),
  addAppliance:    (hid, rid, body)       => request(`/houses/${hid}/rooms/${rid}/appliances`, { method: 'POST', body }),
  updateAppliance: (hid, rid, aid, body)  => request(`/houses/${hid}/rooms/${rid}/appliances/${aid}`, { method: 'PATCH', body }),
  deleteAppliance: (hid, rid, aid)        => request(`/houses/${hid}/rooms/${rid}/appliances/${aid}`, { method: 'DELETE' }),

  // ─── Appliance personalisation (star / drag-sort / usage) ─────────────
  /** Toggle the favourite-star on an appliance. */
  setApplianceFavorite: (hid, rid, aid, favorite) =>
    request(`/houses/${hid}/rooms/${rid}/appliances/${aid}`, {
      method: 'PATCH',
      body: { favorite: !!favorite },
    }),
  /** Atomically increment usageCount + stamp lastUsedAt — call on every toggle. */
  bumpApplianceUsage: (hid, rid, aid) =>
    request(`/houses/${hid}/rooms/${rid}/appliances/${aid}`, {
      method: 'PATCH',
      body: { bumpUsage: true },
    }),
  /** Persist a new drag-to-sort order. orderedIds = appliance IDs top→bottom. */
  reorderAppliances: (hid, rid, orderedIds) =>
    Promise.all(
      orderedIds.map((aid, idx) =>
        request(`/houses/${hid}/rooms/${rid}/appliances/${aid}`, {
          method: 'PATCH',
          body: { sortIndex: idx },
        })
      )
    ),

  // ─── Firmware download ────────────────────────────────────────────────
  /**
   * Downloads the generated .ino as a Blob. Returns { blob, filename }.
   * Pass Wi-Fi SSID + password (entered at download time in the UI).
   */
  async downloadFirmware(hid, rid, bid, { ssid, pass }) {
    const res = await request(
      `/houses/${hid}/rooms/${rid}/boards/${bid}/firmware${qs({ ssid, pass })}`,
      { raw: true }
    );
    const blob = await res.blob();
    // Pull the filename from Content-Disposition if present.
    const dispo = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^"]+)"?/i.exec(dispo);
    const filename = match ? match[1] : 'firmware.ino';
    return { blob, filename };
  },
};
