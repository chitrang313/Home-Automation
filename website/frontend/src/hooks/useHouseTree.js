import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { sortAppliances } from '../utils/applianceSort';

/**
 * useHouseTree — fetches a full house tree (rooms + boards + appliances)
 * via the REST API, and exposes a `refresh()` to reload.
 *
 * Why REST and not the Firestore client SDK directly?
 *   - The backend already enforces permissions + side effects on writes,
 *     and bunches related collections into a stable shape for the UI.
 *   - Listening to multiple subcollections from the client would multiply
 *     listener counts; for a personal dashboard a single one-shot fetch
 *     (with an explicit refresh on every mutation) is simpler and cheap.
 *
 * Returned tree shape:
 *   { house, rooms: [{ id, name, floor, boards, appliances }] }
 */
export default function useHouseTree(houseId) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTree = useCallback(async () => {
    if (!houseId) { setTree(null); return; }
    setLoading(true);
    setError('');
    try {
      const house = await api.getHouse(houseId);
      const rooms = await api.listRooms(houseId);
      // Fetch boards + appliances for every room in parallel.
      const enriched = await Promise.all(
        rooms.map(async (r) => {
          const [boards, appliances] = await Promise.all([
            api.listBoards(houseId, r.id),
            api.listAppliances(houseId, r.id),
          ]);
          // Sort here so every consumer (cards grid, search, board lists)
          // sees the same canonical order — manual drag overrides usage.
          return { ...r, boards, appliances: sortAppliances(appliances) };
        })
      );
      setTree({ house, rooms: enriched });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [houseId]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  return { tree, loading, error, refresh: fetchTree };
}

/**
 * Flatten a house tree into a single appliance list with all the
 * cross-cutting context the search filter / result cards need.
 *
 * Each entry: {
 *   houseId, houseName, roomId, roomName, board, deviceId, ...appliance
 * }
 */
export function flattenTree(tree) {
  if (!tree?.house || !tree.rooms) return [];
  const out = [];
  for (const room of tree.rooms) {
    const boardsById = Object.fromEntries((room.boards || []).map((b) => [b.id, b]));
    for (const a of (room.appliances || [])) {
      const board = a.boardId ? boardsById[a.boardId] : null;
      out.push({
        ...a,
        houseId: tree.house.id,
        houseName: tree.house.name,
        roomId: room.id,
        roomName: room.name,
        board,
        deviceId: board?.deviceId || null,
      });
    }
  }
  return out;
}
