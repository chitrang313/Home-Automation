import { useMemo, useState } from 'react';
import { api } from '../services/api';
import DownloadFirmwareModal from './DownloadFirmwareModal';
import EditApplianceModal from './EditApplianceModal';
import {
  getApplianceType,
  RELAY_SLOTS,
  RELAY_GPIO,
} from '../constants/appliances.jsx';

// GPIO pin dropdown options sorted by pin number ascending (4, 5, 13, 14, …).
const SLOTS_BY_GPIO = [...RELAY_SLOTS].sort(
  (a, b) => (RELAY_GPIO[a] ?? 999) - (RELAY_GPIO[b] ?? 999)
);

export default function BoardCard({ houseId, roomId, board, appliances = [], onChange, onDelete }) {
  const [dlOpen, setDlOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Appliances with a GPIO assigned, sorted by relay slot index.
  const placed = useMemo(() => {
    return appliances
      .filter((a) => a.relaySlot && RELAY_SLOTS.includes(a.relaySlot))
      .sort((a, b) => RELAY_SLOTS.indexOf(a.relaySlot) - RELAY_SLOTS.indexOf(b.relaySlot));
  }, [appliances]);

  // All relay slots currently claimed on this board.
  const takenSlots = useMemo(() => {
    const s = new Set();
    for (const a of appliances) if (a.relaySlot) s.add(a.relaySlot);
    return s;
  }, [appliances]);

  const usedCount = takenSlots.size;
  const editing   = editingId ? appliances.find((a) => a.id === editingId) : null;
  const needsUpdate = !!board.firmwareNeedsUpdate;
  const lastDl = board.lastDownloadAt
    ? new Date(board.lastDownloadAt).toLocaleDateString()
    : 'never';

  // Occupied slots map for the edit modal's collision UI.
  const occupiedSlots = useMemo(() => {
    const m = {};
    for (const a of appliances) {
      if (!a.relaySlot) continue;
      (m[a.boardId] ||= new Set()).add(a.relaySlot);
    }
    return m;
  }, [appliances]);

  const onDeleteBoard = async () => {
    if (!confirm(`Delete ${board.label}? Any appliances on this board will be unassigned.`)) return;
    try {
      await api.deleteBoard(houseId, roomId, board.id);
      onDelete?.();
    } catch (err) {
      alert('Failed to delete board: ' + err.message);
    }
  };

  // Called by SlotRow's Save button after user edits the inline GPIO dropdown.
  const onGpioChange = async (applianceId, newSlot) => {
    await api.updateAppliance(houseId, roomId, applianceId, { relaySlot: newSlot, boardId: board.id });
    await onChange?.();
  };

  // Remove an appliance from this board with a confirmation prompt.
  const onRemove = async (appliance) => {
    if (!confirm(`Remove "${appliance.name}"?\nThis deletes the appliance and frees the GPIO pin.`)) return;
    try {
      await api.deleteAppliance(houseId, roomId, appliance.id);
      await onChange?.();
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    }
  };

  return (
    <div className="rounded-xl border border-slate2 bg-paper">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate2 bg-slate1/40 rounded-t-xl">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {board.label}
            <span className="ml-2 text-xs text-ink/50 font-normal">
              • {usedCount} of 16 GPIO pins used
            </span>
          </div>
          <div className="text-[10px] text-ink/40 font-mono truncate">{board.deviceId}</div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDeleteBoard}
              className="text-xs text-danger hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Relay list ─────────────────────────────────────────────── */}
      <div className="px-2 py-1">
        {placed.length === 0 ? (
          <div className="px-2 py-3 text-xs text-ink/40 italic">
            No appliances wired to this board yet. Add an appliance and assign it to this board.
          </div>
        ) : (
          <ul>
            {placed.map((a) => (
              <SlotRow
                key={a.id}
                appliance={a}
                slot={a.relaySlot}
                takenSlots={takenSlots}
                onEdit={() => setEditingId(a.id)}
                onGpioChange={onGpioChange}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer: firmware download ─────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate2 flex items-center justify-between gap-3">
        <div className="text-[11px] text-ink/55 min-w-0">
          {needsUpdate ? (
            <span className="text-danger font-medium">● Firmware update available</span>
          ) : (
            <span>Last downloaded: {lastDl}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDlOpen(true)}
          className={
            'text-xs font-medium px-3 py-1.5 rounded-md transition shrink-0 ' +
            (needsUpdate
              ? 'bg-danger text-white hover:opacity-90'
              : 'bg-ink text-paper hover:opacity-90')
          }
        >
          ⬇ Download Firmware
        </button>
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}
      <DownloadFirmwareModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        houseId={houseId}
        roomId={roomId}
        board={board}
        appliances={appliances}
        onDownloaded={onChange}
      />
      <EditApplianceModal
        open={!!editing}
        onClose={() => setEditingId(null)}
        appliance={editing}
        boards={[board]}
        occupiedSlots={occupiedSlots}
        isAdmin
        onSave={async (patch) => {
          await api.updateAppliance(houseId, roomId, editing.id, patch);
          await onChange?.();
        }}
      />
    </div>
  );
}

// ─── SlotRow ─────────────────────────────────────────────────────────────────

function SlotRow({ appliance, slot, takenSlots, onEdit, onGpioChange, onRemove }) {
  const [saving, setSaving] = useState(false);

  const handleSelect = async (newSlot) => {
    if (newSlot === slot) return;
    setSaving(true);
    try {
      await onGpioChange(appliance.id, newSlot);
    } catch (err) {
      alert('Failed to reassign GPIO: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-center gap-2 px-2 py-2 border-t border-slate2/60 bg-paper">

      {/* ── GPIO dropdown (auto-saves on change) ────────────────────── */}
      <select
        value={slot}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={saving}
        title="Reassign GPIO pin"
        className="shrink-0 font-mono text-[11px] text-ink/70 bg-paper border border-slate2 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50 hover:border-slate3 transition-colors disabled:opacity-50"
      >
        {SLOTS_BY_GPIO.map((s) => {
          const isCurrent = s === slot;
          const isTaken   = takenSlots.has(s) && !isCurrent;
          const prefix    = isCurrent ? '✓' : isTaken ? '●' : ' ';
          return (
            <option key={s} value={s} disabled={isTaken}>
              {`${prefix} GPIO ${RELAY_GPIO[s]}`}
            </option>
          );
        })}
      </select>

      {/* ── Appliance name / edit button ────────────────────────────── */}
      <button
        type="button"
        onClick={onEdit}
        title="Edit appliance"
        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-slate1/50 rounded-md px-2 py-1 -mx-1 transition"
      >
        <span className="text-base shrink-0" aria-hidden>
          {getApplianceType(appliance.icon || appliance.type).emoji}
        </span>
        <span className="truncate text-sm font-medium">{appliance.name}</span>
        <span className="ml-auto text-[10px] text-ink/50 shrink-0 px-1.5 py-0.5 rounded bg-slate1 mr-0.5">
          {switchTypeShort(appliance.switchType)}
        </span>
        <ChevronDownIcon className="w-3.5 h-3.5 text-ink/30 shrink-0" />
      </button>

      {/* ── Remove button ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => onRemove(appliance)}
        title="Remove appliance"
        aria-label="Remove"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-ink/30 hover:text-danger hover:bg-danger/5 transition"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronDownIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function switchTypeShort(s) {
  switch (s) {
    case 'click': return 'Click';
    case 'none':  return 'App';
    case 'touch':
    default:      return 'Touch';
  }
}
