/**
 * Firmware (.ino) source generator.
 *
 * Pure function: takes a structured context describing the house / room /
 * board / appliances, returns the .ino source as a string. Network /
 * Firestore I/O is the caller's concern — this file has no side effects
 * and is unit-testable.
 *
 * Reference implementation (proven in production):
 *   firmware/4DeviceSwitchControl/4DeviceSwitchControl.ino
 *
 * Key behaviours preserved verbatim from the reference:
 *   - Active-LOW relays (digitalWrite LOW = ON)
 *   - 150 ms debounce window for capacitive touch (TTP223)
 *   -  50 ms debounce window for mechanical click switches
 *   - FALLING-edge interrupt with millis() debouncing inside ISR
 *   - 500 ms Firebase poll interval for app-driven changes
 *
 * Key generalisations on top of the reference:
 *   - Supports 4-channel AND 8-channel relay boards
 *   - Per-relay switch type (touch / click / none)
 *   - Per-device RTDB paths (/devices/{deviceId}/relays/relayN)
 *   - Skips ISR setup entirely for "app-only" relays (switchType=none)
 */

// ─── GPIO pin maps ──────────────────────────────────────────────────────────
// One ESP32 now drives up to 16 individually-wired single relay modules — one
// per safe output GPIO. These are the 16 ESP32 GPIOs that can safely drive an
// output (excludes input-only 34/35/36/39, flash 6-11, and the UART pins).
// MUST mirror frontend src/constants/appliances.jsx (RELAY_GPIO).
const RELAY_PINS = {
  relay1: 23,  relay2: 19,  relay3: 18,  relay4: 5,
  relay5: 25,  relay6: 26,  relay7: 32,  relay8: 33,
  relay9: 22,  relay10: 21, relay11: 27, relay12: 14,
  relay13: 16, relay14: 17, relay15: 4,  relay16: 13,
};

// Switch input pins. Because every safe OUTPUT pin is now claimed by a relay,
// physical switches can only use the four INPUT-ONLY pins (34/35/36/39).
// Therefore only the first four slots support a wired touch/click switch; the
// rest are app-only. (Input-only pins have no internal pull-up, so they're
// driven via INPUT — fine for TTP223 touch modules, which actively drive the
// line; mechanical buttons on these pins need an external pull-up.)
const SWITCH_PINS = {
  relay1: 34, relay2: 35, relay3: 36, relay4: 39,
};

/** Input-only pins (no internal pull-up) — use INPUT instead of INPUT_PULLUP. */
const INPUT_ONLY_PINS = new Set([34, 35, 36, 39]);

const TOUCH_DEBOUNCE_MS = 150; // capacitive touch — quieter, slower retrigger
const CLICK_DEBOUNCE_MS = 50;  // mechanical button — fast tap, more bounce on press

/**
 * Build the .ino source from a structured context.
 *
 * @param {object} ctx
 * @param {object} ctx.house        { name, location }
 * @param {object} ctx.room         { name, floor }
 * @param {object} ctx.board        { deviceId, label, relayCount }
 * @param {Array}  ctx.persons      [{ name }] — contact persons of the house
 * @param {Array}  ctx.appliances   [{ name, relaySlot, switchType, type }]
 * @param {object} ctx.wifi         { ssid, password }
 * @param {object} ctx.firebase     { apiKey, databaseUrl, userEmail, userPassword }
 * @param {Date}   [ctx.generatedAt] override for unit tests
 * @returns {string} the .ino source
 */
function generateIno(ctx) {
  const {
    house,
    room,
    board,
    persons = [],
    appliances = [],
    wifi,
    firebase,
    generatedAt = new Date(),
  } = ctx;

  // Sort by relay slot order so the file reads predictably.
  const slotOrder = Object.keys(RELAY_PINS); // relay1..relay16
  const byRelay = Object.fromEntries(
    appliances
      .filter((a) => a.relaySlot && slotOrder.includes(a.relaySlot))
      .map((a) => [a.relaySlot, a])
  );

  // Emit code only for slots that actually have an appliance — relays can be
  // on ANY of the 16 GPIOs now, so we no longer slice by a contiguous count.
  const usedSlots = slotOrder.filter((s) => byRelay[s]);

  // Pre-compute which slots have a physical switch (not "none").
  // App-only relays get NO ISR, NO pinMode for input, NO interrupt attach.
  // A slot can only be physical if a switch GPIO exists for it (only the
  // first four slots do — see SWITCH_PINS) — otherwise it's app-only.
  const physicalSlots = usedSlots.filter((s) => {
    const ap = byRelay[s];
    return (
      ap &&
      (ap.switchType === 'touch' || ap.switchType === 'click') &&
      SWITCH_PINS[s] !== undefined
    );
  });

  // ─── Build sections ─────────────────────────────────────────────────────
  const headerBlock      = buildHeader(house, room, board, persons, byRelay, usedSlots, generatedAt);
  const wifiBlock        = buildWifiBlock(wifi);
  const firebaseBlock    = buildFirebaseBlock(firebase);
  const pinDefinesBlock  = buildPinDefines(usedSlots, byRelay, physicalSlots);
  const rtdbPathsBlock   = buildRtdbPaths(board.deviceId, usedSlots);
  const debounceBlock    = buildDebounceConstants();
  const fbObjectsBlock   = `// ─── Firebase client objects ─────────────────────────────────────────────
FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;
`;
  const isrStateBlock    = buildIsrStateBlock(physicalSlots, usedSlots);
  const isrFunctionsBlock= buildIsrFunctions(physicalSlots, byRelay);
  const helpersBlock     = buildHelpers();
  const setupBlock       = buildSetup(usedSlots, byRelay, physicalSlots);
  const loopBlock        = buildLoop(usedSlots, byRelay, physicalSlots);

  return [
    headerBlock,
    '#include <WiFi.h>',
    '#include <Firebase_ESP_Client.h>',
    '',
    wifiBlock,
    firebaseBlock,
    pinDefinesBlock,
    rtdbPathsBlock,
    debounceBlock,
    fbObjectsBlock,
    isrStateBlock,
    isrFunctionsBlock,
    helpersBlock,
    setupBlock,
    loopBlock,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
//   SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildHeader(house, room, board, persons, byRelay, usedSlots, generatedAt) {
  const personLines = persons.length
    ? persons.map((p) => ` *    - ${p.name || '(unnamed)'}`).join('\n')
    : ' *    (none assigned)';

  const relayLines = usedSlots
    .map((slot) => {
      const ap = byRelay[slot];
      const pin = `GPIO ${RELAY_PINS[slot]}`.padEnd(8);
      if (!ap) return ` *   ${slot.toUpperCase()} (${pin}) → (empty)`;
      const switchLabel = {
        touch: '[Touch Switch]',
        click: '[Click Switch]',
        none:  '[App Only]',
      }[ap.switchType] || '[Touch Switch]';
      return ` *   ${slot.toUpperCase()} (${pin}) → ${ap.name} ${switchLabel}`;
    })
    .join('\n');

  const ts = formatTimestamp(generatedAt);

  return `/**
 * ============================================================================
 *                       HOME AUTOMATION FIRMWARE
 * ============================================================================
 *   House     : ${house.name}${house.location ? `  (${house.location})` : ''}
 *   Room      : ${room.name}${room.floor ? `  (${room.floor} floor)` : ''}
 *   Board     : ${board.label}  •  ${usedSlots.length} individually-wired relay${usedSlots.length === 1 ? '' : 's'}
 *   Device ID : ${board.deviceId}   (DO NOT CHANGE)
 * ----------------------------------------------------------------------------
 *   Contact Persons:
${personLines}
 * ----------------------------------------------------------------------------
 *   RELAY MAP  (matches your physical wiring)
${relayLines}
 * ----------------------------------------------------------------------------
 *   Generated : ${ts}
 *   Flash ONLY to the ESP32 installed in "${room.name}" of "${house.name}".
 *
 *   WARNING: This file contains Wi-Fi credentials and a Firebase service
 *   account. Do NOT share, commit, or upload it anywhere public.
 * ============================================================================
 */`;
}

function buildWifiBlock(wifi) {
  return `// ─── Wi-Fi credentials (entered at firmware download) ────────────────────
const char* WIFI_SSID     = ${escapeC(wifi.ssid)};
const char* WIFI_PASSWORD = ${escapeC(wifi.password)};
`;
}

function buildFirebaseBlock(fb) {
  return `// ─── Firebase project & dedicated device account ─────────────────────────
#define API_KEY        ${escapeC(fb.apiKey || '')}
#define DATABASE_URL   ${escapeC(fb.databaseUrl || '')}
#define USER_EMAIL     ${escapeC(fb.userEmail || '')}
#define USER_PASSWORD  ${escapeC(fb.userPassword || '')}
`;
}

function buildPinDefines(usedSlots, byRelay, physicalSlots) {
  const relayLines = usedSlots
    .map((slot, i) => {
      const apName = byRelay[slot]?.name || '(empty)';
      return `#define RELAY${i + 1}_PIN  ${RELAY_PINS[slot]}    // ${apName}`;
    })
    .join('\n');

  // Only emit switch-pin defines for slots that have a physical switch.
  const switchLines = physicalSlots
    .map((slot) => {
      const i = usedSlots.indexOf(slot) + 1;
      const ap = byRelay[slot];
      const kind = ap.switchType === 'touch' ? 'Touch' : 'Click';
      return `#define SWITCH${i}_PIN  ${SWITCH_PINS[slot]}    // ${ap.name} (${kind})`;
    })
    .join('\n');

  return `// ─── Relay GPIO pins (active LOW: digitalWrite LOW = relay ON) ────────────
${relayLines}

// ─── Switch GPIO pins (only relays with a physical switch) ───────────────
${switchLines || '// (no physical switches on this board — all relays are app-only)'}
`;
}

function buildRtdbPaths(deviceId, usedSlots) {
  const lines = usedSlots
    .map((slot, i) => {
      return `#define RTDB_RELAY${i + 1}  "/devices/${deviceId}/relays/${slot}"`;
    })
    .join('\n');
  return `// ─── RTDB paths (auto-generated, must match the dashboard) ───────────────
${lines}
`;
}

function buildDebounceConstants() {
  return `// ─── Debounce timing ─────────────────────────────────────────────────────
const unsigned long TOUCH_DEBOUNCE_MS = ${TOUCH_DEBOUNCE_MS};   // capacitive TTP223
const unsigned long CLICK_DEBOUNCE_MS = ${CLICK_DEBOUNCE_MS};    // mechanical button
const unsigned long FIREBASE_POLL_INTERVAL = 500; // ms — how often we sync from RTDB
`;
}

function buildIsrStateBlock(physicalSlots, usedSlots) {
  if (!physicalSlots.length) {
    return `// (no ISRs — every relay on this board is app-only)\n`;
  }
  // We allocate flags for all usedSlots; app-only entries simply never get set.
  return `// ─── Per-channel ISR state (volatile — touched from interrupt context) ───
volatile bool          switchPending[${usedSlots.length}] = { ${usedSlots.map(() => 'false').join(', ')} };
volatile unsigned long lastSwitchMs[${usedSlots.length}]  = { ${usedSlots.map(() => '0').join(', ')} };
`;
}

function buildIsrFunctions(physicalSlots, byRelay) {
  if (!physicalSlots.length) return '';
  return physicalSlots
    .map((slot, idx) => {
      const ap = byRelay[slot];
      const i = idx; // index into switchPending[] for THIS slot
      const debounceMacro = ap.switchType === 'click'
        ? 'CLICK_DEBOUNCE_MS'
        : 'TOUCH_DEBOUNCE_MS';
      return `// ${ap.name} — ${ap.switchType === 'click' ? 'Click Switch' : 'Touch Switch'}
void IRAM_ATTR switch${i + 1}ISR() {
  unsigned long now = millis();
  if (now - lastSwitchMs[${i}] > ${debounceMacro}) {
    switchPending[${i}] = true;
    lastSwitchMs[${i}]  = now;
  }
}`;
    })
    .join('\n\n') + '\n';
}

function buildHelpers() {
  return `
// Toggle the relay tied to relayPin and push the new state to its RTDB path.
// Active-LOW wiring: digitalRead LOW means relay is currently ON.
void toggleRelay(uint8_t relayPin, const char* rtdbPath) {
  bool currentOn = (digitalRead(relayPin) == LOW);
  digitalWrite(relayPin, currentOn ? HIGH : LOW);
  if (Firebase.ready()) {
    Firebase.RTDB.setBool(&fbdo, rtdbPath, !currentOn);
  }
}
`;
}

function buildSetup(usedSlots, byRelay, physicalSlots) {
  // pinMode lines for every relay (always)
  const relayInit = usedSlots
    .map((_, i) => `  pinMode(RELAY${i + 1}_PIN, OUTPUT); digitalWrite(RELAY${i + 1}_PIN, HIGH);  // start OFF`)
    .join('\n');

  // Only physical-switch slots get pinMode + attachInterrupt.
  // Input-only pins (34/35/36/39) have no internal pull-up → use INPUT.
  const switchInit = physicalSlots
    .map((slot) => {
      const i = usedSlots.indexOf(slot) + 1;
      const mode = INPUT_ONLY_PINS.has(SWITCH_PINS[slot]) ? 'INPUT' : 'INPUT_PULLUP';
      return `  pinMode(SWITCH${i}_PIN, ${mode});
  attachInterrupt(digitalPinToInterrupt(SWITCH${i}_PIN), switch${i}ISR, FALLING);`;
    })
    .join('\n');

  return `void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Booting Home Automation firmware…");

  // ─── Relay outputs ────────────────────────────────────────────────────
${relayInit}

${physicalSlots.length ? `  // ─── Switch inputs + interrupts ───────────────────────────────────────\n${switchInit}` : '  // (no physical switches wired — control is app-only)'}

  // ─── Wi-Fi ────────────────────────────────────────────────────────────
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { Serial.print('.'); delay(500); }
  Serial.println(" connected.");

  // ─── Firebase ─────────────────────────────────────────────────────────
  config.api_key       = API_KEY;
  config.database_url  = DATABASE_URL;
  auth.user.email      = USER_EMAIL;
  auth.user.password   = USER_PASSWORD;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Serial.println("Firebase ready.");
}
`;
}

function buildLoop(usedSlots, byRelay, physicalSlots) {
  // Process each physical-switch's pending flag (skip app-only)
  const isrDispatch = physicalSlots
    .map((slot) => {
      const i = usedSlots.indexOf(slot);
      const n = i + 1;
      return `  if (switchPending[${i}]) { switchPending[${i}] = false; toggleRelay(RELAY${n}_PIN, RTDB_RELAY${n}); }`;
    })
    .join('\n');

  // Poll EVERY relay path (including app-only) so app-driven toggles still apply.
  const pollLines = usedSlots
    .map((_, idx) => {
      const n = idx + 1;
      return `    if (Firebase.RTDB.getBool(&fbdo, RTDB_RELAY${n}))
      digitalWrite(RELAY${n}_PIN, fbdo.boolData() ? LOW : HIGH);`;
    })
    .join('\n');

  return `unsigned long lastFirebasePoll = 0;

void loop() {
  // 1. Process flags set by physical-switch ISRs (catches the briefest taps).
${isrDispatch || '  // (no physical switches — nothing to dispatch)'}

  // 2. Poll RTDB so app-driven toggles take effect within ~500 ms.
  if (Firebase.ready() && (millis() - lastFirebasePoll >= FIREBASE_POLL_INTERVAL)) {
    lastFirebasePoll = millis();
${pollLines}
  }
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//   HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Wrap a string as a safe C string literal (escapes backslash and quote). */
function escapeC(s) {
  return '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** "15 Jan 2026, 10:30 AM" — human readable, locale-independent. */
function formatTimestamp(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh + 11) % 12) + 1;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${h12}:${mm} ${ampm}`;
}

/**
 * Build a download path where the folder and the file share the same name:
 *
 *     {HouseName}_{RoomName}/{HouseName}_{RoomName}.ino
 *
 * e.g. "GaneshKrupa_Hall/GaneshKrupa_Hall.ino" — Arduino IDE requires a
 * sketch's .ino to live in a folder of the same name, so this drops straight
 * into the IDE without renaming.
 *
 * Caveats the caller should be aware of:
 *   - Browsers sanitise the `download` attribute and most STRIP path
 *     separators for security (Chrome turns "a/b" into "a_b"), so the
 *     subfolder may not materialise on every browser — but the house+room
 *     are always preserved in the name.
 *   - If a room ever holds more than one ESP32 board, both downloads share
 *     this name and would overwrite each other. We append a short board
 *     suffix ONLY in that case (passed via opts.disambiguate) to stay safe
 *     while keeping single-board names clean.
 *
 * @param {object} house  { name }
 * @param {object} room   { name }
 * @param {object} board  { label }
 * @param {object} [opts] { disambiguate?: boolean } — append board label
 */
function buildFilename(house, room, board, opts = {}) {
  const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
  const h = slug(house.name) || 'House';
  const r = slug(room.name) || 'Room';
  let stem = `${h}_${r}`;
  if (opts.disambiguate) {
    const b = slug(board.label) || 'Board';
    stem = `${stem}_${b}`;
  }
  // Folder name === file stem (Arduino sketch-folder convention).
  return `${stem}/${stem}.ino`;
}

module.exports = { generateIno, buildFilename, RELAY_PINS, SWITCH_PINS };
