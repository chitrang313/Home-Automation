import { useEffect, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';

/**
 * Subscribes to the appliance's relayPath in RTDB and renders a toggle.
 * Props: appliance = { id, name, icon, relayPath }
 */
export default function ApplianceCard({ appliance }) {
  const [state, setState] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appliance.relayPath) return;
    const r = ref(db, appliance.relayPath);
    const unsub = onValue(r, (snap) => setState(!!snap.val()));
    return () => unsub();
  }, [appliance.relayPath]);

  const onToggle = async () => {
    setBusy(true);
    try {
      await set(ref(db, appliance.relayPath), !state);
    } catch (e) {
      alert('Failed to toggle: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const isOn = state === true;
  return (
    <div className="card flex items-center justify-between gap-3 sm:gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ApplianceIcon kind={appliance.icon} on={isOn} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{appliance.name}</div>
          <div className="text-[10px] sm:text-xs text-ink/50 font-mono truncate">
            {appliance.relayPath}
          </div>
        </div>
      </div>
      {/* Toggle — bigger on mobile (16x9 px) for thumb taps, classic 14x8 on desktop */}
      <button
        onClick={onToggle}
        disabled={busy || state === null}
        aria-pressed={isOn}
        aria-label={`Toggle ${appliance.name}`}
        className={
          'relative shrink-0 w-16 h-9 sm:w-14 sm:h-8 rounded-full transition-colors duration-150 ' +
          (isOn ? 'bg-success' : 'bg-slate3') +
          ' disabled:opacity-50 active:scale-[0.97]'
        }
      >
        <span
          className={
            'absolute top-1 h-7 w-7 sm:h-6 sm:w-6 rounded-full bg-white shadow transition-all duration-150 ' +
            (isOn ? 'left-8 sm:left-7' : 'left-1')
          }
        />
      </button>
    </div>
  );
}

/** Minimal inline-SVG icons (no external lib). */
function ApplianceIcon({ kind, on }) {
  const color = on ? 'text-success' : 'text-ink/40';
  const common = 'w-6 h-6 ' + color;
  switch (kind) {
    case 'fan':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="2" />
          <path d="M12 10c0-3 1-6 4-6s4 4 1 7" />
          <path d="M14 12c3 0 6 1 6 4s-4 4-7 1" />
          <path d="M12 14c0 3-1 6-4 6s-4-4-1-7" />
          <path d="M10 12c-3 0-6-1-6-4s4-4 7-1" />
        </svg>
      );
    case 'tv':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'plug':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} stroke="currentColor" strokeWidth="1.8">
          <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4" />
        </svg>
      );
    case 'ac':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="8" rx="2" />
          <path d="M7 17l-1 3M12 17l-1 3M17 17l-1 3" />
        </svg>
      );
    case 'bulb':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={common} stroke="currentColor" strokeWidth="1.8">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1 1 1.7V17h5v-1.4c0-.7.4-1.3 1-1.7A6 6 0 0 0 12 3z" />
        </svg>
      );
  }
}
