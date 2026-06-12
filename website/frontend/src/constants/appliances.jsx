/**
 * Canonical appliance-type catalogue.
 *
 * Single source of truth for:
 *   - dropdowns (add / edit appliance, search filter)
 *   - icon selection on cards
 *   - generated-firmware comments (label only — pin assignment is in
 *     the backend firmware-generator.js)
 *
 * `id`     stored as appliance.type — never changes for a given appliance.
 * `label`  human-facing dropdown text.
 * `emoji`  fallback glyph for environments without the SVG bundle.
 * `Svg`    React component renderer used by ApplianceIcon.
 */

/** HOC that produces a 24×24 stroked SVG icon component from inner paths. */
const makeIcon = (children) => function Icon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
};

export const APPLIANCE_TYPES = [
  {
    id: 'fan',
    label: 'Fan',
    emoji: '💨',
    Svg: makeIcon(
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 10c0-3 1-6 4-6s4 4 1 7" />
        <path d="M14 12c3 0 6 1 6 4s-4 4-7 1" />
        <path d="M12 14c0 3-1 6-4 6s-4-4-1-7" />
        <path d="M10 12c-3 0-6-1-6-4s4-4 7-1" />
      </>
    ),
  },
  {
    id: 'light',
    label: 'Light',
    emoji: '💡',
    Svg: makeIcon(
      <>
        <path d="M9 18h6" />
        <path d="M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1 1 1.7V17h5v-1.4c0-.7.4-1.3 1-1.7A6 6 0 0 0 12 3z" />
      </>
    ),
  },
  {
    id: 'ac',
    label: 'AC',
    emoji: '❄️',
    Svg: makeIcon(
      <>
        <rect x="3" y="5" width="18" height="8" rx="2" />
        <path d="M7 17l-1 3M12 17l-1 3M17 17l-1 3" />
      </>
    ),
  },
  {
    id: 'geyser',
    label: 'Geyser',
    emoji: '🔥',
    Svg: makeIcon(
      <>
        <rect x="6" y="3" width="12" height="14" rx="3" />
        <path d="M9 21c0-2 1.5-2 1.5-4S9 15 9 13" />
        <path d="M15 21c0-2 1.5-2 1.5-4S15 15 15 13" />
      </>
    ),
  },
  {
    id: 'exhaust',
    label: 'Exhaust Fan',
    emoji: '🌀',
    Svg: makeIcon(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6" />
      </>
    ),
  },
  {
    id: 'tv',
    label: 'TV',
    emoji: '📺',
    Svg: makeIcon(
      <>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
  {
    id: 'curtain',
    label: 'Curtain',
    emoji: '🪟',
    Svg: makeIcon(
      <>
        <path d="M3 4h18" />
        <path d="M5 4v16c2-1 2-3 2-5s0-7-2-9" />
        <path d="M19 4v16c-2-1-2-3-2-5s0-7 2-9" />
        <path d="M12 4v16" />
      </>
    ),
  },
  {
    id: 'plug',
    label: 'Smart Plug',
    emoji: '🔌',
    Svg: makeIcon(
      <>
        <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4" />
      </>
    ),
  },
  {
    id: 'other',
    label: 'Other',
    emoji: '🔘',
    Svg: makeIcon(<circle cx="12" cy="12" r="8" />),
  },
];

/** Fast lookup by id. */
export const APPLIANCE_TYPE_MAP = Object.fromEntries(
  APPLIANCE_TYPES.map((t) => [t.id, t])
);

/** Resolve a type id → catalogue entry, defaulting to "other". */
export function getApplianceType(id) {
  return APPLIANCE_TYPE_MAP[id] || APPLIANCE_TYPE_MAP.other;
}

/**
 * Render an appliance icon by type/icon id. Used everywhere we display
 * an appliance — keeps the visual language consistent.
 */
export function ApplianceIcon({ kind = 'other', on = false, className = '' }) {
  const def = getApplianceType(kind);
  const Svg = def.Svg;
  const tone = on ? 'text-success' : 'text-ink/40';
  return <Svg className={`w-6 h-6 ${tone} ${className}`} />;
}

/** Switch-type catalogue — used in the appliance editor dropdown. */
export const SWITCH_TYPES = [
  {
    id: 'touch',
    label: 'Touch Switch',
    hint: 'Capacitive TTP223 sensor — light, instant tap (default).',
  },
  {
    id: 'click',
    label: 'Click Switch',
    hint: 'Traditional mechanical push button on the switchboard.',
  },
  {
    id: 'none',
    label: 'None (App Only)',
    hint: 'No physical switch — control only from the app.',
  },
];

export const SWITCH_TYPE_MAP = Object.fromEntries(SWITCH_TYPES.map((s) => [s.id, s]));

/**
 * One ESP32 now drives up to 16 individually-wired single relay modules —
 * one per safe output GPIO. The "4/8-channel board" concept is gone; each
 * slot is just one relay on one fixed GPIO pin.
 *
 * RELAY_GPIO / SWITCH_GPIO MUST mirror the backend firmware generator
 * (website/backend/src/utils/firmware-generator.js). Relay pins are the 16
 * ESP32 GPIOs that can safely drive an output. Physical switches (touch /
 * click) can only use the 4 input-only pins (34/35/36/39), so only the first
 * four slots support a wired switch — the rest are app-only.
 */
export const RELAY_SLOTS = [
  'relay1',  'relay2',  'relay3',  'relay4',
  'relay5',  'relay6',  'relay7',  'relay8',
  'relay9',  'relay10', 'relay11', 'relay12',
  'relay13', 'relay14', 'relay15', 'relay16',
];

export const RELAY_GPIO = {
  relay1: 23, relay2: 19, relay3: 18, relay4: 5,
  relay5: 25, relay6: 26, relay7: 32, relay8: 33,
  relay9: 22, relay10: 21, relay11: 27, relay12: 14,
  relay13: 16, relay14: 17, relay15: 4, relay16: 13,
};
export const SWITCH_GPIO = {
  relay1: 34, relay2: 35, relay3: 36, relay4: 39,
};

/** "RELAY1 · GPIO 23" style label for a slot. */
export function relayPinLabel(slot) {
  const n = RELAY_SLOTS.indexOf(slot) + 1;
  const gpio = RELAY_GPIO[slot];
  if (!n || gpio === undefined) return '';
  return `RELAY${n} · GPIO ${gpio}`;
}

/** "GPIO 23" style label (pin-first) for the assignment dropdown. */
export function gpioLabel(slot) {
  const gpio = RELAY_GPIO[slot];
  return gpio === undefined ? slot : `GPIO ${gpio}`;
}
