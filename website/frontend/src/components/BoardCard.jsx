import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../services/api';
import DownloadFirmwareModal from './DownloadFirmwareModal';
import EditApplianceModal from './EditApplianceModal';
import {
  getApplianceType,
  RELAY_SLOTS,
  relayPinLabel,
} from '../constants/appliances.jsx';

/**
 * Visual slot editor for one Board.
 *
 *   - Renders 4 or 8 numbered slots based on board.relayCount.
 *   - Each slot shows its firmware pin (RELAYn_PIN · GPIO xx).
 *   - Occupied slots are drag-rearrangeable: dragging reorders the
 *     appliances and compacts them into relay1..relayK in the new order
 *     (persisted atomically via api.reorderBoardSlots). This rewires which
 *     GPIO each appliance uses, so the board is flagged for a re-flash.
 *   - "Download Firmware" button with update-available badge.
 *
 * Admin-only — used inside Admin Dashboard room editors.
 */
export default function BoardCard({ houseId, roomId, board, appliances = [], onChange, onDelete }) {
  const [dlOpen, setDlOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Appliances WITH a GPIO assigned, in pin order — these are draggable.
  const placed = useMemo(() => {
    return appliances
      .filter((a) => a.relaySlot && RELAY_SLOTS.includes(a.relaySlot))
      .sort((a, b) => RELAY_SLOTS.indexOf(a.relaySlot) - RELAY_SLOTS.indexOf(b.relaySlot));
  }, [appliances]);

  // Local mirror so the drop settles before the parent refetch reorders DOM.
  const [items, setItems] = useState(placed);
  useEffect(() => { setItems(placed); }, [placed]);

  const usedCount = appliances.length;
  const editing = editingId ? appliances.find((a) => a.id === editingId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((a) => a.id === active.id);
    const newIndex = items.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next); // optimistic
    try {
      await api.reorderBoardSlots(houseId, roomId, board.id, next.map((a) => a.id));
      await onChange?.();
    } catch (err) {
      console.error('slot reorder failed', err);
      setItems(prev); // rollback
      alert('Failed to rearrange slots: ' + err.message);
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
        {onDelete && (
          <button onClick={onDeleteBoard} className="text-xs text-danger hover:underline shrink-0 ml-2">
            Delete
          </button>
        )}
      </div>

      {/* ── Relay list (each row shows its actual GPIO; drag to reorder) ─ */}
      <div className="px-2 py-1">
        {items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-ink/40 italic">
            No appliances wired to this ESP32 yet.
          </div>
        ) : (
          <>
            {items.length > 1 && (
              <div className="px-2 pt-2 pb-1 text-[10px] text-ink/40">
                Drag a row to renumber the relays (compacts to RELAY1, RELAY2, …).
                To pin an appliance to a specific GPIO, use its edit pencil.
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <ul>
                  {items.map((a) => (
                    <SortableSlotRow
                      key={a.id}
                      appliance={a}
                      slot={a.relaySlot}
                      onEdit={() => setEditingId(a.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </>
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
          onChange?.();
        }}
      />
    </div>
  );
}

/** One draggable occupied-slot row. */
function SortableSlotRow({ appliance, slot, onEdit }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: appliance.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 'auto',
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-3 px-2 py-2.5 border-t border-slate2/60 bg-paper ' +
        (isDragging ? 'shadow-md rounded-lg ring-1 ring-accent/30' : '')
      }
    >
      <button
        type="button"
        aria-label="Drag to rearrange"
        {...attributes}
        {...listeners}
        className="shrink-0 w-5 flex items-center justify-center text-ink/30 hover:text-ink/70 cursor-grab active:cursor-grabbing touch-none"
      >
        <DragDots className="w-4 h-4" />
      </button>
      <span className="font-mono text-[10px] text-ink/55 w-32 shrink-0">{relayPinLabel(slot)}</span>
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-slate1/50 rounded-md px-2 py-1 -mx-1 transition"
      >
        <span className="text-base shrink-0" aria-hidden>
          {getApplianceType(appliance.icon || appliance.type).emoji}
        </span>
        <span className="truncate text-sm font-medium">{appliance.name}</span>
        <span className="ml-auto text-[10px] text-ink/50 shrink-0 px-1.5 py-0.5 rounded bg-slate1">
          {switchTypeShort(appliance.switchType)}
        </span>
      </button>
    </li>
  );
}

function DragDots({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
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
