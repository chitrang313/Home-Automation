import { useEffect, useMemo, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import RoomTabs from '../components/RoomTabs';
import ApplianceCard from '../components/ApplianceCard';

export default function UserDashboard() {
  const { person } = useAuth();
  const houseIds = useMemo(() => Object.keys(person?.houseIds || {}), [person]);
  const [activeHouseId, setActiveHouseId] = useState(null);
  const [house, setHouse] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null);

  useEffect(() => {
    if (!activeHouseId && houseIds.length) setActiveHouseId(houseIds[0]);
  }, [houseIds, activeHouseId]);

  useEffect(() => {
    if (!activeHouseId) return;
    const r = ref(db, `houses/${activeHouseId}`);
    const unsub = onValue(r, (snap) => setHouse(snap.val()));
    return () => unsub();
  }, [activeHouseId]);

  const rooms = useMemo(() => {
    if (!house?.rooms) return [];
    return Object.entries(house.rooms)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [house]);

  useEffect(() => {
    if (!activeRoomId && rooms.length) setActiveRoomId(rooms[0].id);
    if (activeRoomId && !rooms.find(r => r.id === activeRoomId)) {
      setActiveRoomId(rooms[0]?.id || null);
    }
  }, [rooms, activeRoomId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const appliances = activeRoom?.appliances
    ? Object.entries(activeRoom.appliances).map(([id, a]) => ({ id, ...a }))
    : [];

  if (houseIds.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-8 sm:py-14">
        <div className="card">
          <h2 className="text-lg font-semibold">No house assigned</h2>
          <p className="text-ink/60 text-sm mt-1">
            You haven't been added to any house yet. Contact the admin to get linked to one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-10 pb-12">
      {houseIds.length > 1 && (
        <div className="mb-4 sm:mb-5">
          <label className="label">House</label>
          <select
            className="input w-full sm:max-w-xs"
            value={activeHouseId || ''}
            onChange={(e) => { setActiveHouseId(e.target.value); setActiveRoomId(null); setHouse(null); }}
          >
            {houseIds.map((hid) => (
              <option key={hid} value={hid}>{hid}</option>
            ))}
          </select>
        </div>
      )}

      <section className="mb-5 sm:mb-7">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{house?.name || 'Loading…'}</h1>
        {house?.location && <p className="text-ink/60 text-sm mt-1 break-words">{house.location}</p>}
      </section>

      <section className="mb-4 sm:mb-5">
        <RoomTabs rooms={rooms} activeId={activeRoomId} onSelect={setActiveRoomId} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {appliances.length === 0 ? (
          <div className="text-ink/50 text-sm">No appliances in this room yet.</div>
        ) : (
          appliances.map((a) => <ApplianceCard key={a.id} appliance={a} />)
        )}
      </section>
    </main>
  );
}
