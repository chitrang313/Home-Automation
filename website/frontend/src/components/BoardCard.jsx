import { useMemo, useState } from 'react';
import { api } from '../services/api';
import DownloadFirmwareModal from './DownloadFirmwareModal';
import EditApplianceModal from './EditApplianceModal';
import { getApplianceType } from '../constants/appliances.jsx';

/**
 * Visual slot editor for one Board.
 *
 *   - Renders 4 or 8 numbered slots based on board.relayCount.
 *   - Each occupied slot shows the appliance's icon + name + switch type chip.
 *   - Each empty slot shows a placeholder.
 *   - "Download Firmware" button at the bottom with update-available badge
 *     and a tooltip showing the last-download date.
 *
 * Admin-only — used inside Admin Dashboard room editors.
 *
 * Props:
 *   houseId, roomId
 *   board           { id, label, deviceId, relayCount, lastDownloadAt, firmwareNeedsUpdate }
 *   appliances      every appliance whose boardId === board.id
 *   onChange()      refresh callback (called after any mutation)
 *   onDelete()      optional — admin deletes the board
 */
export default function BoardCard({ houseId, roomId, board, appliances = [], onChange, onDelete }) {
  const [dlOpen, setDlOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Sort appliances by relaySlot index so the visual order matches the firmware.
  const bySlot = useMemo(() => {
    const m = {};
    for (const a of appliances) if (a.relaySlot) m[a.relaySlot] = a;
    return m;
  }, [appliances]);

  const totalSlots = (board.relayCount || 4) >= 8 ? 8 : 4;
  const slots = Array.from({ length: totalSlots }, (_, i) => `relay${i + 1}`);
  const usedCount = appliances.length;
  const editing = editingId ? appliances.find((a) => a.id === editingId) : null;

  // For slot collision detection in the edit modal.
  const occupiedSlots = useMemo(() => {
    const m = {};
    for (const a of appliances) {
      if (!a.relaySlot) continue;
      (m[a.boardId] ||= new Set()).add(a.relaySlot);
    }
    return m;
  }, [appliances]);

  const needsUpdate = !!board.firmwareNeedsUpdate;
  const lastDl = board.lastDownloadAt
    ? new Date(board.lastDownloadAt).toLocaleDateString()
    : 'never';

  const onDeleteBoard = async () => {
    if (!confirm(`Delete ${board.label}? Any appliances on this board will be unassigned.`)) return;
    await api.deleteBoard(houseId, roomId, board.id);
    onDelete?.();
  };

  return (
    <div className="rounded-xl border border-slate2 bg-paper">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate2 bg-slate1/40 rounded-t-xl">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {board.label}
            <span className="ml-2 text-xs text-ink/50 font-normal">
              • {board.relayCount}-Channel • {usedCount} appliance{usedCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="text-[10px] text-ink/40 font-mono truncate">{board.deviceId}</div>
        </div>
        {onDelete && (
          <button onClick={onDeleteBoard} className="text-xs text-danger hover:underline shrink-0 ml-2">
            Delete
          </button>
        )}
      </div>

      {/* ── Slot grid ──────────────────────────────────────────────── */}
      <ul className="divide-y divide-slate2">
        {slots.map((slot) => {
          const a = bySlot[slot];
          return (
            <li key={slot} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono text-[11px] text-ink/45 w-12 shrink-0">{slot.toUpperCase()}</span>
              {a ? (
                <button
                  type="button"
                  onClick={() => setEditingId(a.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-slate1/50 rounded-md px-2 py-1 -mx-2 transition"
                >
                  <span className="text-base shrink-0" aria-hidden>
                    {getApplianceType(a.icon || a.type).emoji}
                  </span>
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <span className="ml-auto text-[10px] text-ink/50 shrink-0 px-1.5 py-0.5 rounded bg-slate1">
                    {switchTypeShort(a.switchType)}
                  </span>
                </button>
              ) : (
                <span className="text-xs text-ink/40 italic">empty</span>
              )}
            </li>
          );
        })}
      </ul>

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
          onChange?.();
        }}
      />
    </div>
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
