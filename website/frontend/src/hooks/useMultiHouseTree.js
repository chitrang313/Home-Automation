import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { flattenTree } from './useHouseTree';
import { sortAppliances } from '../utils/applianceSort';

/**
 * useMultiHouseTree — for screens that need to see appliances across
 * multiple houses (Admin Dashboard, User Dashboard with > 1 house).
 *
 *   Fetches each house tree in parallel, returns the combined flat
 *   appliance list + per-house breakdown + room directory.
 */
export default function useMultiHouseTree(houseIds) {
  const [data, setData] = useState({ trees: [], appliances: [], rooms: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stableIds = (houseIds || []).slice().sort().join(',');

  const fetchAll = useCallback(async () => {
    if (!houseIds || houseIds.length === 0) {
      setData({ trees: [], appliances: [], rooms: [] });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const trees = await Promise.all(
        houseIds.map(async (hid) => {
          const house = await api.getHouse(hid);
          const rooms = await api.listRooms(hid);
          const enriched = await Promise.all(
            rooms.map(async (r) => {
              const [boards, appliances] = await Promise.all([
                api.listBoards(hid, r.id),
                api.listAppliances(hid, r.id),
              ]);
              return { ...r, boards, appliances: sortAppliances(appliances) };
            })
          );
          return { house, rooms: enriched };
        })
      );

      const flatAppliances = trees.flatMap((t) => flattenTree(t));
      const flatRooms = trees.flatMap((t) =>
        t.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          houseId: t.house.id,
          houseName: t.house.name,
        }))
      );

      setData({ trees, appliances: flatAppliances, rooms: flatRooms });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { ...data, loading, error, refresh: fetchAll };
}
