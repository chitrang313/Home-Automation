import { useMemo, useState } from 'react';
import Combobox from './Combobox';
import {
  APPLIANCE_TYPES,
  getApplianceType,
} from '../constants/appliances.jsx';

/**
 * Cascading search filter for Houses → Rooms → Appliance Type.
 *
 *   - All three fields are searchable comboboxes (type or pick).
 *   - Room options narrow to the chosen House (if any).
 *   - Filters compose with AND semantics.
 *   - Mobile: collapses into a single bar with a "(n active)" badge.
 *
 * The component is data-driven — it does NOT fetch anything itself.
 * Parent supplies houses + rooms (each room must carry { id, name, houseId,
 * houseName }) so we can render the cross-house room labels.
 *
 * Props:
 *   houses, rooms              Domain data
 *   value = { houseId, roomId, type }
 *   onChange(nextValue)        Called whenever any field changes
 *   resultCount, totalCount    Optional counts shown in the active-filter pill
 */
export default function SearchFilter({
  houses = [],
  rooms = [],
  value,
  onChange,
  resultCount,
  totalCount,
}) {
  const { houseId = '', roomId = '', type = '' } = value || {};
  const [openMobile, setOpenMobile] = useState(false);

  // Rooms visible in the dropdown — narrowed by selected house (if any).
  const visibleRooms = useMemo(() => {
    if (!houseId) return rooms;
    return rooms.filter((r) => r.houseId === houseId);
  }, [rooms, houseId]);

  // If the user picks a house that doesn't contain the currently-selected
  // room, clear the room. Done in onChange so we never have stale state.
  const set = (patch) => {
    const next = { houseId, roomId, type, ...patch };
    if ('houseId' in patch) {
      const stillValid = visibleRoomsAfter(rooms, next.houseId).some((r) => r.id === next.roomId);
      if (!stillValid) next.roomId = '';
    }
    onChange(next);
  };

  const activeCount = [houseId, roomId, type].filter(Boolean).length;
  const isActive = activeCount > 0;

  const houseOptions = houses.map((h) => ({ id: h.id, label: h.name }));
  const typeOptions  = APPLIANCE_TYPES.map((t) => ({
    id: t.id,
    label: `${t.emoji}  ${t.label}`,
  }));

  return (
    <section className="card mb-5 p-4 md:p-5">
      {/* ── Header — title + result count + mobile collapse toggle ───── */}
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2">
          <SearchIcon className="w-5 h-5 text-ink/60" />
          <h2 className="font-semibold text-sm md:text-base">Find Appliances</h2>
          {isActive && (
            <span className="text-[11px] font-medium bg-accent/10 text-accent rounded-full px-2 py-0.5">
              {activeCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isActive && resultCount !== undefined && (
            <span className="hidden md:inline text-xs text-ink/60">
              Showing {resultCount}{totalCount !== undefined ? ` of ${totalCount}` : ''}
            </span>
          )}
          {isActive && (
            <button
              onClick={() => onChange({ houseId: '', roomId: '', type: '' })}
              className="text-xs text-ink/60 hover:text-ink transition"
            >
              Clear All
            </button>
          )}
          {/* Mobile-only collapse toggle */}
          <button
            type="button"
            onClick={() => setOpenMobile((v) => !v)}
            className="md:hidden text-xs text-ink/60"
            aria-label={openMobile ? 'Collapse filters' : 'Expand filters'}
          >
            {openMobile ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Fields ──────────────────────────────────────────────────── */}
      <div className={(openMobile ? 'grid' : 'hidden') + ' md:grid grid-cols-1 md:grid-cols-3 gap-3'}>
        <FieldWrap label="House" iconHint="🏠">
          <Combobox
            value={houseId}
            onChange={(id) => set({ houseId: id })}
            options={houseOptions}
            placeholder="All houses"
            allOptionLabel="All Houses"
            icon={<span aria-hidden>🏠</span>}
          />
        </FieldWrap>

        <FieldWrap label="Room" iconHint="🚪">
          <Combobox
            value={roomId}
            onChange={(id) => set({ roomId: id })}
            options={visibleRooms.map((r) => ({
              id: r.id,
              label: r.name,
              group: r.houseName,
            }))}
            getGroup={(o) => (houseId ? null : o.group)}
            placeholder="All rooms"
            allOptionLabel="All Rooms"
            icon={<span aria-hidden>🚪</span>}
            disabled={visibleRooms.length === 0}
          />
        </FieldWrap>

        <FieldWrap label="Appliance Type" iconHint="⚡">
          <Combobox
            value={type}
            onChange={(id) => set({ type: id })}
            options={typeOptions}
            placeholder="All types"
            allOptionLabel="All Types"
            icon={<span aria-hidden>⚡</span>}
          />
        </FieldWrap>
      </div>

      {/* ── Active filter chips ─────────────────────────────────────── */}
      {isActive && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip
            shown={!!houseId}
            label={houseLabel(houses, houseId)}
            icon="🏠"
            onClear={() => set({ houseId: '' })}
          />
          <Chip
            shown={!!roomId}
            label={roomLabel(rooms, roomId)}
            icon="🚪"
            onClear={() => set({ roomId: '' })}
          />
          <Chip
            shown={!!type}
            label={typeLabel(type)}
            icon={getApplianceType(type).emoji}
            onClear={() => set({ type: '' })}
          />
          {resultCount !== undefined && (
            <span className="md:hidden text-xs text-ink/60 ml-auto">
              {resultCount}{totalCount !== undefined ? `/${totalCount}` : ''} shown
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function visibleRoomsAfter(rooms, houseId) {
  return houseId ? rooms.filter((r) => r.houseId === houseId) : rooms;
}

function houseLabel(houses, id) {
  return houses.find((h) => h.id === id)?.name || '—';
}
function roomLabel(rooms, id) {
  return rooms.find((r) => r.id === id)?.name || '—';
}
function typeLabel(id) {
  return getApplianceType(id).label;
}

function FieldWrap({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink/60 mb-1">{label}</div>
      {children}
    </label>
  );
}

function Chip({ shown, label, icon, onClear }) {
  if (!shown) return null;
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate1 text-ink text-xs font-medium px-2.5 py-1 rounded-full">
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="ml-0.5 text-ink/50 hover:text-ink transition"
      >×</button>
    </span>
  );
}

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
