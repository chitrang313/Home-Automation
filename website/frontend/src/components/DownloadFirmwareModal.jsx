import { useState } from 'react';
import Modal from './Modal';
import { api } from '../services/api';
import { getApplianceType } from '../constants/appliances.jsx';

/**
 * Wi-Fi-credentials prompt + .ino download trigger.
 *
 * On success the backend:
 *   1. seeds RTDB relay state nodes (so the dashboard cards work immediately)
 *   2. sets board.lastDownloadAt = now
 *   3. clears board.firmwareNeedsUpdate
 * — so the parent should re-fetch the board after onClose to see the badge clear.
 *
 * Props:
 *   open, onClose
 *   houseId, roomId, board, appliances     — context for the file we're generating
 *   onDownloaded()                         — called after successful download
 */
export default function DownloadFirmwareModal({
  open,
  onClose,
  houseId,
  roomId,
  board,
  appliances = [],
  onDownloaded,
}) {
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!ssid.trim() || !pass) {
      setErr('Both Wi-Fi name and password are required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const { blob, filename } = await api.downloadFirmware(houseId, roomId, board.id, {
        ssid: ssid.trim(),
        pass,
      });
      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onDownloaded?.();
      onClose?.();
    } catch (e2) {
      setErr(e2.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  if (!board) return null;

  // Build a compact relay map preview for confidence.
  const slotsToShow = (board.relayCount || 4) >= 8 ? 8 : 4;
  const bySlot = Object.fromEntries(
    appliances.filter((a) => a.relaySlot).map((a) => [a.relaySlot, a])
  );

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="Download Firmware" maxWidth="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-5">
        {/* ─── Context strip ──────────────────────────────────────────── */}
        <div className="text-sm">
          <div className="text-ink/60 text-xs uppercase tracking-wide font-medium">
            Flashing target
          </div>
          <div className="font-medium mt-0.5">
            {board.label}  ·  {board.relayCount || 4}-Channel
          </div>
          <div className="text-xs text-ink/50 mt-0.5">
            Device ID  <span className="font-mono">{board.deviceId}</span>
          </div>
        </div>

        {/* ─── Wi-Fi credentials ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="label" htmlFor="wf-ssid">Wi-Fi Network (SSID)</label>
            <input
              id="wf-ssid"
              className="input"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="MyHomeWiFi"
              autoComplete="off"
              maxLength={64}
            />
          </div>
          <div>
            <label className="label" htmlFor="wf-pass">Wi-Fi Password</label>
            <div className="relative">
              <input
                id="wf-pass"
                className="input pr-12"
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                maxLength={128}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs text-ink/60 hover:text-ink"
                tabIndex={-1}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Relay map preview ──────────────────────────────────────── */}
        <div>
          <div className="text-xs font-medium text-ink/60 mb-2">Relay map (preview)</div>
          <ul className="text-xs space-y-1 bg-slate1/50 rounded-lg p-3 max-h-56 overflow-y-auto">
            {Array.from({ length: slotsToShow }, (_, i) => {
              const slot = `relay${i + 1}`;
              const ap = bySlot[slot];
              return (
                <li key={slot} className="flex items-center gap-2">
                  <span className="font-mono text-ink/50 w-14 shrink-0">{slot.toUpperCase()}</span>
                  {ap ? (
                    <>
                      <span aria-hidden>{getApplianceType(ap.icon || ap.type).emoji}</span>
                      <span className="truncate font-medium">{ap.name}</span>
                      <span className="text-ink/40 ml-auto shrink-0">
                        {switchTypeShort(ap.switchType)}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink/40">— empty —</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ─── Safety warning ─────────────────────────────────────────── */}
        <div className="text-xs text-ink/60 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          ⚠ The downloaded <code>.ino</code> file contains your Wi-Fi password
          and Firebase credentials. Treat it like a key — do not share or
          commit it to a public repo.
        </div>

        {err && <div className="text-sm text-danger">{err}</div>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Generating…' : '⬇ Download .ino'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function switchTypeShort(s) {
  switch (s) {
    case 'click': return 'Click';
    case 'none':  return 'App Only';
    case 'touch':
    default:      return 'Touch';
  }
}
