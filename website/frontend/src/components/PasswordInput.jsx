import { useState } from 'react';

/**
 * Password field with a hold-to-reveal eye button:
 *
 *   - Press and HOLD the eye  → password shown in plain text
 *   - Release (or move away)  → hidden again immediately
 *
 * Works with mouse (down/up/leave), touch (start/end/cancel) and keyboard
 * (hold Space/Enter on the focused button). Hold-only reveal means the
 * password can never be accidentally left visible on a shared screen.
 *
 * Props: any <input> props (value, onChange, required, minLength, …).
 *        `className` defaults to the app's "input" style.
 */
export default function PasswordInput({ className = 'input', ...inputProps }) {
  const [visible, setVisible] = useState(false);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={className + ' pr-11'}
      />
      <button
        type="button"
        aria-label="Hold to show password"
        title="Hold to show password"
        // Mouse
        onMouseDown={(e) => { e.preventDefault(); show(); }}
        onMouseUp={hide}
        onMouseLeave={hide}
        // Touch
        onTouchStart={(e) => { e.preventDefault(); show(); }}
        onTouchEnd={hide}
        onTouchCancel={hide}
        // Keyboard: hold Space/Enter while the button is focused
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(); } }}
        onKeyUp={hide}
        onBlur={hide}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-ink/45 hover:text-ink/80 transition select-none"
      >
        <EyeIcon open={visible} className="w-5 h-5" />
      </button>
    </div>
  );
}

function EyeIcon({ open, className }) {
  return open ? (
    // Eye open — password currently visible
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    // Eye with slash — hidden
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
