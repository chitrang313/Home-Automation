import { useEffect, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { rtdb } from '../firebase';
import { ApplianceIcon } from '../constants/appliances.jsx';

/**
 * Subscribes to the appliance's live relay state in RTDB and renders a
 * toggle. Optional "Edit" pencil opens the rename / icon modal.
 *
 * Props:
 *   appliance     { id, name, icon, type, boardId, relaySlot, switchType }
 *   deviceId      String — the device ID of the appliance's board.
 *                 Required for live state; if omitted the card shows "unlinked".
 *   onEdit()      Optional — opens the parent's edit modal (rename + icon).
 *   subtitle      Optional — extra line (e.g. "Ami Kunj › Hall" in search results).
 *   showRelayPath For debugging / admin — display the raw RTDB path.
 */
export default function ApplianceCard({
  appliance,
  deviceId,
  onEdit,
  subtitle,
  showRelayPath = false,
}) {
  const [state, setState] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);

  // Compose the RTDB path. Without a deviceId or relaySlot the card is "unlinked".
  const relayPath =
    deviceId && appliance.relaySlot
      ? `devices/${deviceId}/relays/${appliance.relaySlot}`
      : null;

  // ─── Subscribe to live relay state ─────────────────────────────────────
  useEffect(() => {
    if (!relayPath) { setState(null); return; }
    const r = ref(rtdb, relayPath);
    const unsub = onValue(r, (snap) => setState(!!snap.val()));
    return () => unsub();
  }, [relayPath]);

  const onToggle = async () => {
    if (!relayPath) return;
    setBusy(true);
    try {
      await set(ref(rtdb, relayPath), !state);
    } catch (e) {
      alert('Failed to toggle: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const isOn = state === true;
  const unlinked = !relayPath;

  return (
    <div
      className={
        'card flex items-center justify-between gap-3 sm:gap-4 transition ' +
        (isOn ? 'ring-1 ring-success/30' : '')
      }
    >
      {/* ─── Left: icon + identity ──────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={
            'shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition ' +
            (isOn ? 'bg-success/10' : 'bg-slate1')
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

      {/* ─── Right: edit + toggle ───────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
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
            'relative w-14 h-8 rounded-full transition-colors duration-150 ' +
            (isOn ? 'bg-success' : 'bg-slate3') +
            ' disabled:opacity-40 disabled:cursor-not-allowed'
          }
        >
          <span
            className={
              'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-150 ' +
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
