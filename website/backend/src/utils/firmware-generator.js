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
// Relay pin order mirrors the working reference firmware for slots 1-4, then
// extends with safe additional ESP32 DevKit pins for slots 5-8.
const RELAY_PINS = {
  relay1: 23,
  relay2: 19,
  relay3: 18,
  relay4: 5,
  relay5: 25,
  relay6: 26,
  relay7: 32,
  relay8: 33,
};

// Switch input pins — first four match the working reference exactly.
// The remaining four are chosen from ESP32 GPIOs that support INPUT_PULLUP
// and external interrupts, and don't conflict with boot strapping or flash.
const SWITCH_PINS = {
  relay1: 13,
  relay2: 12,
  relay3: 14,
  relay4: 27,
  relay5: 4,
  relay6: 15,
  relay7: 16,
  relay8: 17,
};

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
  const slotOrder = ['relay1','relay2','relay3','relay4','relay5','relay6','relay7','relay8'];
  const byRelay = Object.fromEntries(
    appliances
      .filter((a) => a.relaySlot && slotOrder.includes(a.relaySlot))
      .map((a) => [a.relaySlot, a])
  );

  const totalSlots = board.relayCount || 4;
  const usedSlots = slotOrder.slice(0, totalSlots);

  // Pre-compute which slots have a physical switch (not "none").
  // App-only relays get NO ISR, NO pinMode for input, NO interrupt attach.
  const physicalSlots = usedSlots.filter((s) => {
    const ap = byRelay[s];
    return ap && (ap.switchType === 'touch' || ap.switchType === 'click');
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
 *   Board     : ${board.label}  •  ${board.relayCount}-Channel Relay Module
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

  // Only physical-switch slots get pinMode + attachInterrupt
  const switchInit = physicalSlots
    .map((slot) => {
      const i = usedSlots.indexOf(slot) + 1;
      return `  pinMode(SWITCH${i}_PIN, INPUT_PULLUP);
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

/** Build a safe download filename like "AmiKunj_Hall_Board1.ino". */
function buildFilename(house, room, board) {
  const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
  const h = slug(house.name) || 'House';
  const r = slug(room.name) || 'Room';
  const b = slug(board.label) || 'Board';
  return `${h}_${r}_${b}.ino`;
}

module.exports = { generateIno, buildFilename, RELAY_PINS, SWITCH_PINS };
