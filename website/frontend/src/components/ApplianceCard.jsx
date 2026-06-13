import { useEffect, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../firebase';
import { api } from '../services/api';
import { ApplianceIcon } from '../constants/appliances.jsx';

/**
 * Subscribes to the appliance's live relay state in RTDB and renders a
 * toggle. Also shows a favourite-star (any member), an edit-pencil (parent
 * decides whether to wire it up) and an optional drag handle for sortable
 * grids.
 *
 * Every successful toggle calls api.bumpApplianceUsage() so we can sort
 * "most-frequently-used" automatically. The usage bump is fire-and-forget:
 * a network blip should never block the actual relay command.
 *
 * Props:
 *   appliance      { id, name, icon, type, boardId, relaySlot, switchType,
 *                    favorite, usageCount, lastUsedAt, ... }
 *   houseId, roomId Required for the favourite + usage REST calls. If
 *                  omitted, those features degrade gracefully (read-only).
 *   deviceId       Device ID of the appliance's board. Required for live
 *                  state; if omitted the card shows "unlinked".
 *   onEdit()       Optional — opens the parent's edit modal.
 *   onFavoriteChanged()  Optional — parent refetches list after star toggle.
 *   subtitle       Optional — extra line (e.g. "Ami Kunj › Hall" in search results).
 *   dragHandleProps  Optional — props from @dnd-kit's useSortable so the
 *                    drag handle on the left becomes the listener target.
 *   isDragging     Optional — render with a subtle "lifted" style.
 *   showRelayPath  Debug / admin — display the raw RTDB path.
 */
export default function ApplianceCard({
  appliance,
  houseId,
  roomId,
  deviceId,
  onEdit,
  onFavoriteChanged,
  subtitle,
  dragHandleProps,
  isDragging = false,
  showRelayPath = false,
}) {
  const [state, setState] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  // Optimistic local favorite — flips instantly while the network call runs.
  const [localFav, setLocalFav] = useState(!!appliance.favorite);
  useEffect(() => { setLocalFav(!!appliance.favorite); }, [appliance.favorite]);

  // Compose the RTDB path. Without a deviceId or relaySlot the card is "unlinked".
  const relayPath =
    deviceId && appliance.relaySlot
      ? `devices/${deviceId}/relays/${appliance.relaySlot}`
      : null;

  // ─── Subscribe to live relay state ─────────────────────────────────────
  // onValue fires immediately with null for a path that doesn't exist yet
  // (so a freshly-seeded board resolves to OFF). The error callback is the
  // important part: if the read is denied or the network blips, the success
  // callback never fires and `state` would otherwise stay null forever —
  // which permanently disables the toggle. Resolving to `false` on error
  // keeps the control usable (the next successful read corrects it).
  useEffect(() => {
    if (!relayPath) { setState(null); return; }
    const r = ref(rtdb, relayPath);
    const unsub = onValue(
      r,
      (snap) => setState(!!snap.val()),
      (err) => {
        console.warn('relay state read failed for', relayPath, err?.message);
        setState(false);
      }
    );
    return () => unsub();
  }, [relayPath]);

  const onToggle = async () => {
    if (!relayPath) return;
    setBusy(true);
    try {
      await set(ref(rtdb, relayPath), !state);
      // Fire-and-forget usage bump — never blocks the toggle UX.
      if (houseId && roomId) {
        api
          .bumpApplianceUsage(houseId, roomId, appliance.id)
          .catch((err) => console.warn('usage bump failed', err));
      }
    } catch (e) {
      alert('Failed to toggle: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const onToggleFavorite = async (e) => {
    e.stopPropagation();
    if (!houseId || !roomId || favBusy) return;
    const next = !localFav;
    setLocalFav(next);          // optimistic
    setFavBusy(true);
    try {
      await api.setApplianceFavorite(houseId, roomId, appliance.id, next);
      onFavoriteChanged?.(appliance.id, next);
    } catch (err) {
      setLocalFav(!next);       // roll back
      alert('Failed to update favourite: ' + err.message);
    } finally {
      setFavBusy(false);
    }
  };

  const isOn = state === true;
  const unlinked = !relayPath;
  const canFavorite = !!(houseId && roomId);

  return (
    <div
      className={
        'card flex items-center justify-between gap-3 sm:gap-4 ' +
        (isDragging ? 'scale-[1.03] opacity-90 ' : '')
      }
    >
      {/* ─── Left: optional drag handle + icon + identity ──────────── */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {dragHandleProps && (
          <button
            type="button"
            aria-label="Drag to reorder"
            {...dragHandleProps}
            className="shrink-0 w-6 h-9 -ml-1 flex items-center justify-center text-ink/30 hover:text-ink/70 cursor-grab active:cursor-grabbing touch-none"
          >
            <DragIcon className="w-4 h-4" />
          </button>
        )}
        <div
          className={
            'shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors ' +
            (isOn ? 'bg-success/15' : 'bg-slate1')
          }
        >
          <ApplianceIcon kind={appliance.icon || appliance.type} on={isOn} className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        <div className="min-w-0">
          <div className="font-medium truncate text-sm sm:text-base">{appliance.name}</div>
          {subtitle ? (
            <div className="text-[11px] sm:text-xs text-ink/55 truncate mt-0.5">{subtitle}</div>
          ) : (
            <div className="text-[11px] sm:text-xs text-ink/50 truncate mt-0.5">
              {unlinked
                ? 'Not assigned to a board yet'
                : `${appliance.relaySlot?.toUpperCase()} • ${labelForSwitch(appliance.switchType)}`}
            </div>
          )}
          {showRelayPath && relayPath && (
            <div className="text-[10px] text-ink/40 font-mono truncate mt-0.5">{relayPath}</div>
          )}
        </div>
      </div>

      {/* ─── Right: favourite + edit + toggle ───────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {canFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={favBusy}
            aria-label={localFav ? `Unfavourite ${appliance.name}` : `Favourite ${appliance.name}`}
            aria-pressed={localFav}
            className={
              'w-9 h-9 rounded-full hover:bg-slate1 transition flex items-center justify-center ' +
              (localFav ? 'text-amber-500' : 'text-ink/30 hover:text-ink/70')
            }
            title={localFav ? 'Remove from favourites' : 'Add to favourites'}
          >
            <StarIcon filled={localFav} className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${appliance.name}`}
            className="w-9 h-9 rounded-full hover:bg-slate1 text-ink/50 hover:text-ink transition flex items-center justify-center"
          >
            <EditIcon className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onToggle}
          disabled={busy || state === null || unlinked}
          aria-pressed={isOn}
          aria-label={`Toggle ${appliance.name}`}
          className={
            'relative w-14 h-8 rounded-full transition-colors ' +
            (isOn ? 'bg-success' : 'bg-slate3') +
            ' disabled:opacity-40 disabled:cursor-not-allowed'
          }
        >
          <span
            className={
              'absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 ease-out ' +
              (isOn ? 'left-7' : 'left-1')
            }
          />
        </button>
      </div>
    </div>
  );
}

function labelForSwitch(switchType) {
  switch (switchType) {
    case 'click': return 'Click Switch';
    case 'none':  return 'App Only';
    case 'touch':
    default:      return 'Touch Switch';
  }
}

function EditIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 20h4l11-11-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ filled, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3.5l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17l-5.3 2.81 1.01-5.9L3.42 9.73l5.93-.86L12 3.5z" />
    </svg>
  );
}

function DragIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9"  cy="6"  r="1.5" />
      <circle cx="15" cy="6"  r="1.5" />
      <circle cx="9"  cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9"  cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
