import { auth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function authHeader() {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body, requireAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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
  return res.json();
}

export const api = {
  // auth
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, requireAuth: false }),

  // persons
  me: () => request('/persons/me'),
  listPersons: () => request('/persons'),
  createPerson: (body) => request('/persons', { method: 'POST', body }),
  updatePerson: (id, body) => request(`/persons/${id}`, { method: 'PATCH', body }),
  deletePerson: (id) => request(`/persons/${id}`, { method: 'DELETE' }),

  // houses
  listHouses: () => request('/houses'),
  getHouse: (houseId) => request(`/houses/${houseId}`),
  createHouse: (body) => request('/houses', { method: 'POST', body }),
  updateHouse: (houseId, body) => request(`/houses/${houseId}`, { method: 'PATCH', body }),
  deleteHouse: (houseId) => request(`/houses/${houseId}`, { method: 'DELETE' }),

  // link / unlink
  linkPersonToHouse: (houseId, personId) =>
    request(`/houses/${houseId}/persons/${personId}`, { method: 'PUT' }),
  unlinkPersonFromHouse: (houseId, personId) =>
    request(`/houses/${houseId}/persons/${personId}`, { method: 'DELETE' }),

  // rooms
  addRoom: (houseId, body) => request(`/houses/${houseId}/rooms`, { method: 'POST', body }),
  updateRoom: (houseId, roomId, body) =>
    request(`/houses/${houseId}/rooms/${roomId}`, { method: 'PATCH', body }),
  deleteRoom: (houseId, roomId) =>
    request(`/houses/${houseId}/rooms/${roomId}`, { method: 'DELETE' }),

  // appliances
  addAppliance: (houseId, roomId, body) =>
    request(`/houses/${houseId}/rooms/${roomId}/appliances`, { method: 'POST', body }),
  updateAppliance: (houseId, roomId, applianceId, body) =>
    request(`/houses/${houseId}/rooms/${roomId}/appliances/${applianceId}`, { method: 'PATCH', body }),
  deleteAppliance: (houseId, roomId, applianceId) =>
    request(`/houses/${houseId}/rooms/${roomId}/appliances/${applianceId}`, { method: 'DELETE' }),
};
