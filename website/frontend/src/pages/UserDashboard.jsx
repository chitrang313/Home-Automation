import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import RoomTabs from '../components/RoomTabs';
import ApplianceCard from '../components/ApplianceCard';
import SortableApplianceGrid from '../components/SortableApplianceGrid';
import EditApplianceModal from '../components/EditApplianceModal';
import SearchFilter from '../components/SearchFilter';
import useMultiHouseTree from '../hooks/useMultiHouseTree';

/**
 * User-facing dashboard.
 *
 *   Houses are chips at the top (only if user has > 1).
 *   Inside each house, rooms are a horizontal scroll tab strip.
 *   Search filter is sticky above the grid — any active filter switches
 *   to a flat result-card view that spans every house + room.
 */
export default function UserDashboard() {
  const { person } = useAuth();
  const houseIds = useMemo(
    () => Object.keys(person?.houseIds || {}),
    [person]
  );

  const { trees, appliances, rooms, loading, error, refresh } =
    useMultiHouseTree(houseIds);

  // ─── Active scope (when no filter applied) ─────────────────────────────
  const [activeHouseId, setActiveHouseId] = useState(null);
  const [activeRoomId,  setActiveRoomId]  = useState(null);

  // Default active house once data lands.
  useEffect(() => {
    if (!activeHouseId && trees.length) setActiveHouseId(trees[0].house.id);
  }, [trees, activeHouseId]);

  const activeTree  = trees.find((t) => t.house.id === activeHouseId);
  const activeRooms = activeTree?.rooms || [];

  // Default active room (and re-default when switching houses).
  useEffect(() => {
    if (activeRooms.length === 0) { setActiveRoomId(null); return; }
    if (!activeRoomId || !activeRooms.find((r) => r.id === activeRoomId)) {
      setActiveRoomId(activeRooms[0].id);
    }
  }, [activeRooms, activeRoomId]);

  const activeRoom = activeRooms.find((r) => r.id === activeRoomId) || activeRooms[0];

  // ─── Search filter state ───────────────────────────────────────────────
  const [filter, setFilter] = useState({ houseId: '', roomId: '', type: '' });
  const filterActive = !!(filter.houseId || filter.roomId || filter.type);

  // Favourites-only switch (independent of search filter — orthogonal).
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!filterActive) return [];
    return appliances.filter((a) => {
      if (filter.houseId && a.houseId !== filter.houseId) return false;
      if (filter.roomId  && a.roomId  !== filter.roomId)  return false;
      if (filter.type    && a.type    !== filter.type)    return false;
      if (favoritesOnly  && !a.favorite)                  return false;
      return true;
    });
  }, [appliances, filter, filterActive, favoritesOnly]);

  // Appliances to render inside the currently-selected room. When the
  // header star is active, only favourites in this room appear.
  const visibleRoomAppliances = useMemo(() => {
    if (!activeRoom) return [];
    return favoritesOnly
      ? activeRoom.appliances.filter((a) => a.favorite)
      : activeRoom.appliances;
  }, [activeRoom, favoritesOnly]);

  const roomHasAnyFavorite = !!activeRoom?.appliances?.some((a) => a.favorite);

  // ─── Edit modal state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState(null);
  const openEdit = (houseId, roomId, applianceId) => {
    const tree = trees.find((t) => t.house.id === houseId);
    const room = tree?.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const appliance = room.appliances.find((a) => a.id === applianceId);
    if (!appliance) return;
    const occupied = {};
    for (const ap of room.appliances) {
      if (!ap.relaySlot) continue;
      (occupied[ap.boardId] ||= new Set()).add(ap.relaySlot);
    }
    setEditing({ houseId, roomId, appliance, boards: room.boards, occupiedSlots: occupied });
  };
  const saveEdit = async (patch) => {
    await api.updateAppliance(editing.houseId, editing.roomId, editing.appliance.id, patch);
    await refresh();
  };

  // ─── Empty state: no houses ────────────────────────────────────────────
  if (houseIds.length === 0) {
    return (
      <main className="max-w-3xl mx-auto px-5 py-14">
        <div className="card text-center">
          <h2 className="text-lg font-semibold">No house assigned</h2>
          <p className="text-ink/60 text-sm mt-1">
            You haven&apos;t been added to any house yet. Contact the admin to get linked.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-10">
      {/* House switcher — only when there are multiple AND no filter is active */}
      {trees.length > 1 && !filterActive && (
        <nav className="mb-5 flex flex-wrap gap-2">
          {trees.map((t) => {
            const isActive = t.house.id === activeHouseId;
            return (
              <button
                key={t.house.id}
                onClick={() => { setActiveHouseId(t.house.id); setActiveRoomId(null); }}
                className={
                  'px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ' +
                  (isActive
                    ? 'bg-ink text-paper'
                    : 'bg-slate1 text-ink/70 hover:bg-slate2')
                }
              >
                {t.house.name}
              </button>
            );
          })}
        </nav>
      )}

      <SearchFilter
        houses={trees.map((t) => ({ id: t.house.id, name: t.house.name }))}
        rooms={rooms}
        value={filter}
        onChange={setFilter}
        resultCount={filtered.length}
        totalCount={appliances.length}
      />

      {error && <div className="card text-danger text-sm mb-4">{error}</div>}
      {loading && <div className="text-ink/60 text-sm">Loading…</div>}

      {filterActive ? (
        filtered.length === 0 ? (
          <EmptyState onClear={() => setFilter({ houseId: '', roomId: '', type: '' })} />
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {filtered.map((a) => (
              <ApplianceCard
                key={`${a.houseId}-${a.roomId}-${a.id}`}
                appliance={a}
                houseId={a.houseId}
                roomId={a.roomId}
                deviceId={a.deviceId}
                subtitle={`${a.houseName} › ${a.roomName}`}
                onEdit={() => openEdit(a.houseId, a.roomId, a.id)}
                onFavoriteChanged={refresh}
              />
            ))}
          </section>
        )
      ) : (
        activeTree && (
          <>
            <section className="mb-5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {activeTree.house.name}
              </h1>
              {activeTree.house.location && (
                <p className="text-sm mt-1 text-ink/60">{activeTree.house.location}</p>
              )}
            </section>

            <section className="mb-4 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <RoomTabs
                  rooms={activeRooms}
                  activeId={activeRoom?.id}
                  onSelect={setActiveRoomId}
                />
              </div>
              {/* Favourites-only filter for the current room */}
              <FavoritesToggle
                active={favoritesOnly}
                onToggle={() => setFavoritesOnly((v) => !v)}
                disabled={!roomHasAnyFavorite && !favoritesOnly}
                count={activeRoom?.appliances.filter((a) => a.favorite).length || 0}
              />
            </section>

            {!activeRoom || activeRoom.appliances.length === 0 ? (
              <div className="text-ink/60 text-sm">
                No appliances in this room yet.
              </div>
            ) : visibleRoomAppliances.length === 0 ? (
              <div className="card text-center py-8 text-sm text-ink/55">
                No favourites in this room yet. Tap the ☆ on any appliance to add it.
              </div>
            ) : (
              <SortableApplianceGrid
                houseId={activeTree.house.id}
                roomId={activeRoom.id}
                appliances={visibleRoomAppliances}
                boards={activeRoom.boards}
                onEdit={(a) => openEdit(activeTree.house.id, activeRoom.id, a.id)}
                onChange={refresh}
                // When showing only favourites the visible order is a subset of
                // the full list — disable drag so we don't write a partial order.
                disabled={favoritesOnly}
              />
            )}
          </>
        )
      )}

      <EditApplianceModal
        open={!!editing}
        onClose={() => setEditing(null)}
        appliance={editing?.appliance}
        boards={editing?.boards}
        occupiedSlots={editing?.occupiedSlots}
        isAdmin={!!person?.admin}
        onSave={saveEdit}
      />
    </main>
  );
}

function EmptyState({ onClear }) {
  return (
    <div className="card text-center py-10 px-5">
      <SearchOff className="w-10 h-10 mx-auto text-ink/30 mb-2" />
      <h3 className="font-semibold">No appliances found</h3>
      <p className="text-xs text-ink/55 mt-1">
        No matches for the current filter.
      </p>
      <button onClick={onClear} className="btn-secondary mt-4 text-sm">
        Clear filters
      </button>
    </div>
  );
}

function SearchOff({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M8 8l6 6M14 8l-6 6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Header-level filter button. Active → only favourite appliances are
 * shown inside the currently-selected room. Disabled (with an empty
 * count) when the room has no favourites yet — a tooltip hints how to
 * add one.
 */
function FavoritesToggle({ active, onToggle, disabled, count }) {
  const title = disabled
    ? 'No favourites yet — tap the ☆ on any appliance card to add one'
    : active
      ? 'Show all appliances'
      : 'Show favourites only';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      className={
        'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ' +
        (active
          ? 'bg-amber-400/15 text-amber-700 ring-1 ring-amber-400/40'
          : 'bg-slate1 text-ink/70 hover:bg-slate2') +
        ' disabled:opacity-50 disabled:cursor-not-allowed'
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <path d="M12 3.5l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17l-5.3 2.81 1.01-5.9L3.42 9.73l5.93-.86L12 3.5z" />
      </svg>
      <span>Favourites</span>
      {count > 0 && (
        <span className={
          'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] rounded-full ' +
          (active ? 'bg-amber-500 text-white' : 'bg-slate2 text-ink/70')
        }>{count}</span>
      )}
    </button>
  );
}
