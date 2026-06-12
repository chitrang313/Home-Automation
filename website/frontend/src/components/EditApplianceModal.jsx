import { useEffect, useState } from 'react';
import Modal from './Modal';
import {
  APPLIANCE_TYPES,
  SWITCH_TYPES,
  RELAY_SLOTS,
  gpioLabel,
} from '../constants/appliances.jsx';

/**
 * Edit modal for an appliance.
 *
 *   - "Cosmetic" tab is available to every house member — rename + icon.
 *   - "Hardware" tab (admin only) — change type, switch type, board, relay slot.
 *
 * Renaming and icon changes never affect the relay wiring (RTDB path = deviceId
 * + relaySlot, which we don't touch in the cosmetic flow). We make this clear
 * with an inline info note in the modal.
 *
 * Props:
 *   open            boolean
 *   onClose()       close callback
 *   appliance       { id, name, type, icon, switchType, boardId, relaySlot }
 *   boards          [{ id, label, relayCount }]   — boards in same room
 *   occupiedSlots   { boardId -> Set<relaySlot> }  — for slot collision UI
 *   isAdmin         boolean
 *   onSave(patch)   async — receives the diff to send to the backend
 */
export default function EditApplianceModal({
  open,
  onClose,
  appliance,
  boards = [],
  occupiedSlots = {},
  isAdmin = false,
  onSave,
}) {
  // Local form state — initialised from the appliance, reset every open.
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [type, setType] = useState('');
  const [switchType, setSwitchType] = useState('');
  const [boardId, setBoardId] = useState('');
  const [relaySlot, setRelaySlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open || !appliance) return;
    setName(appliance.name || '');
    setIcon(appliance.icon || appliance.type || 'other');
    setType(appliance.type || 'other');
    setSwitchType(appliance.switchType || 'touch');
    // One ESP32 per room — auto-attach to the room's board (no board picker).
    setBoardId(appliance.boardId || boards[0]?.id || '');
    setRelaySlot(appliance.relaySlot || '');
    setErr('');
  }, [open, appliance, boards]);

  if (!appliance) return null;

  // Every board now exposes all 16 GPIO slots.
  const slotChoices = RELAY_SLOTS;

  // Build diff vs original — only send changed fields so backend doesn't
  // see no-op writes (keeps audit trail clean and avoids needless reconciles).
  const buildPatch = () => {
    const patch = {};
    if (name !== appliance.name) patch.name = name.trim();
    if (icon !== appliance.icon) patch.icon = icon;
    if (isAdmin) {
      if (type !== appliance.type) patch.type = type;
      if (switchType !== appliance.switchType) patch.switchType = switchType;
      if (boardId !== appliance.boardId) patch.boardId = boardId || null;
      if (relaySlot !== appliance.relaySlot) patch.relaySlot = relaySlot || null;
    }
    return patch;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) { onClose?.(); return; }
    if (!name.trim()) { setErr('Name cannot be empty'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(patch);
      onClose?.();
    } catch (e2) {
      setErr(e2.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Edit Appliance">
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ─── Icon picker grid ───────────────────────────────────────── */}
        <div>
          <div className="text-xs font-medium text-ink/60 mb-2">Icon</div>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
            {APPLIANCE_TYPES.map((t) => {
              const Selected = t.Svg;
              const active = icon === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setIcon(t.id)}
                  title={t.label}
                  className={
                    'aspect-square rounded-lg border transition flex items-center justify-center ' +
                    (active
                      ? 'border-accent ring-2 ring-accent/40 bg-accent/5 text-accent'
                      : 'border-slate2 hover:border-slate3 text-ink/70')
                  }
                >
                  <Selected className="w-6 h-6" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Name ───────────────────────────────────────────────────── */}
        <div>
          <label className="label" htmlFor="ap-name">Name</label>
          <input
            id="ap-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Master Bedroom Fan"
            autoComplete="off"
            maxLength={60}
          />
        </div>

        {/* ─── Admin-only hardware section ────────────────────────────── */}
        {isAdmin && (
          <details className="rounded-lg bg-slate1/50 px-4 py-3 group">
            <summary className="text-sm font-medium cursor-pointer flex items-center justify-between">
              <span>Hardware mapping</span>
              <span className="text-xs text-ink/50 group-open:hidden">tap to expand</span>
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  {APPLIANCE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.emoji}  {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Switch Type</label>
                <select className="input" value={switchType} onChange={(e) => setSwitchType(e.target.value)}>
                  {SWITCH_TYPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">GPIO Pin</label>
                <select
                  className="input"
                  value={relaySlot}
                  onChange={(e) => setRelaySlot(e.target.value)}
                >
                  <option value="">— pick a GPIO pin —</option>
                  {slotChoices.map((s) => {
                    const taken =
                      occupiedSlots[boardId]?.has(s) && s !== appliance.relaySlot;
                    return (
                      <option key={s} value={s} disabled={taken}>
                        {gpioLabel(s)}{taken ? ' (in use)' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-ink/50 mt-1">
                  The ESP32 pin this appliance&apos;s relay is wired to. Each pin
                  drives one relay; pins already used in this room are disabled.
                </p>
              </div>
            </div>
          </details>
        )}

        {/* ─── Safety note ────────────────────────────────────────────── */}
        <div className="text-xs text-ink/60 bg-slate1/60 rounded-lg p-3 leading-relaxed">
          ℹ️ Renaming or changing the icon does <strong>not</strong> affect the
          relay wiring or the ESP32 firmware. The physical control keeps working
          exactly as before.
        </div>

        {err && <div className="text-sm text-danger">{err}</div>}

        {/* ─── Actions ────────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
