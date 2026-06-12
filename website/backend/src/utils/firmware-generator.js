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
 * Key behaviours preserved from the reference:
 *   - Active-LOW relays (digitalWrite LOW = ON)
 *   - 150 ms debounce window for capacitive touch (TTP223)
 *   -  50 ms debounce window for mechanical click switches
 *   - FALLING-edge interrupt with millis() debouncing inside ISR
 *
 * Production hardening on top of the reference:
 *   - RTDB STREAM instead of 500 ms polling — dashboard toggles apply
 *     instantly, idle traffic drops from ~7k req/hour to a held socket,
 *     and a reconnect snapshot restores relay state after power loss.
 *   - Bounded auth retries + token status callback — wrong credentials log
 *     a clear error and stop, instead of hammering Firebase Auth until the
 *     account is locked (auth/too-many-requests).
 *   - Wi-Fi boot timeout + runtime watchdog (clean ESP.restart recovery),
 *     WiFi.setSleep(false) for the GPIO36/39 interrupt errata + latency.
 *   - Offline-first switches: wall switches always work; unsynced toggles
 *     are queued (pendingPush) and re-pushed on reconnect so RTDB can't
 *     revert a real-world switch press.
 *   - Up to 16 relays, one per safe output GPIO; per-relay switch type
 *     (touch / click / none); per-device RTDB paths; app-only relays get
 *     no ISR/interrupt code at all.
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

  // A board with no wired appliance still gets a valid (idle) sketch.
  if (usedSlots.length === 0) {
    return buildHeader(house, room, board, persons, byRelay, usedSlots, generatedAt) +
      '\n\nvoid setup() {}\nvoid loop() {}\n// No appliances are assigned to this board yet — assign GPIO pins in the dashboard and re-download.\n';
  }

  // ─── Build sections ─────────────────────────────────────────────────────
  const headerBlock      = buildHeader(house, room, board, persons, byRelay, usedSlots, generatedAt);
  const wifiBlock        = buildWifiBlock(wifi);
  const firebaseBlock    = buildFirebaseBlock(firebase);
  const pinDefinesBlock  = buildPinDefines(usedSlots, byRelay, physicalSlots);
  const rtdbPathsBlock   = buildRtdbPaths(board.deviceId, usedSlots);
  const debounceBlock    = buildDebounceConstants();
  const fbObjectsBlock   = buildFirebaseObjects();
  const channelTable     = buildChannelTables(usedSlots, byRelay);
  const isrStateBlock    = buildIsrStateBlock(physicalSlots, usedSlots);
  const isrFunctionsBlock= buildIsrFunctions(physicalSlots, byRelay, usedSlots);
  const helpersBlock     = buildHelpers(usedSlots);
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
    channelTable,
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
// The device STREAMS the parent node (instant push from the dashboard) and
// writes individual children when a physical switch toggles a relay.
#define RTDB_RELAYS_BASE  "/devices/${deviceId}/relays"
${lines}
`;
}

function buildDebounceConstants() {
  return `// ─── Timing constants ────────────────────────────────────────────────────
const unsigned long TOUCH_DEBOUNCE_MS   = ${TOUCH_DEBOUNCE_MS};    // capacitive TTP223
const unsigned long CLICK_DEBOUNCE_MS   = ${CLICK_DEBOUNCE_MS};     // mechanical button
const unsigned long WIFI_BOOT_TIMEOUT_MS    = 30000;  // give up + restart if Wi-Fi won't join at boot
const unsigned long WIFI_LOST_RESTART_MS    = 120000; // restart if Wi-Fi stays down this long at runtime
const unsigned long PENDING_PUSH_RETRY_MS   = 2000;   // retry interval for unsynced local toggles
`;
}

function buildFirebaseObjects() {
  return `// ─── Firebase client objects ─────────────────────────────────────────────
// fbdo   — request channel for writes (switch toggles, pending re-syncs)
// stream — dedicated channel for the RTDB stream (library requirement)
FirebaseData   fbdo;
FirebaseData   stream;
FirebaseAuth   auth;
FirebaseConfig config;
`;
}

function buildChannelTables(usedSlots, byRelay) {
  const n = usedSlots.length;
  const pins  = usedSlots.map((s, i) => `RELAY${i + 1}_PIN`).join(', ');
  const keys  = usedSlots.map((s) => `"${s}"`).join(', ');
  const paths = usedSlots.map((s, i) => `RTDB_RELAY${i + 1}`).join(', ');
  const names = usedSlots.map((s) => `"${escapeForC(byRelay[s].name)}"`).join(', ');
  return `// ─── Channel tables (index i = one relay channel) ─────────────────────────
#define CH_COUNT ${n}
const uint8_t CH_PIN[CH_COUNT]   = { ${pins} };
const char*   CH_KEY[CH_COUNT]   = { ${keys} };   // RTDB child key
const char*   CH_PATH[CH_COUNT]  = { ${paths} };  // full RTDB path
const char*   CH_NAME[CH_COUNT]  = { ${names} };

// Set when a local (wall-switch) toggle could not be pushed to RTDB —
// retried until it succeeds; stream updates for that channel are ignored
// meanwhile so a reconnect can't silently revert a real-world switch press.
bool pendingPush[CH_COUNT] = { ${usedSlots.map(() => 'false').join(', ')} };
`;
}

function buildIsrStateBlock(physicalSlots, usedSlots) {
  if (!physicalSlots.length) {
    return `// (no ISRs — every relay on this board is app-only)\n`;
  }
  return `// ─── Per-channel ISR state (volatile — touched from interrupt context) ───
volatile bool          switchPending[CH_COUNT] = { ${usedSlots.map(() => 'false').join(', ')} };
volatile unsigned long lastSwitchMs[CH_COUNT]  = { ${usedSlots.map(() => '0').join(', ')} };
`;
}

function buildIsrFunctions(physicalSlots, byRelay, usedSlots) {
  if (!physicalSlots.length) return '';
  // IMPORTANT: the flag index must be the CHANNEL index (position in
  // usedSlots), not the position among physical switches — otherwise an
  // app-only relay between two switched ones shifts every flag by one and
  // the wrong relay toggles.
  return physicalSlots
    .map((slot) => {
      const ap = byRelay[slot];
      const ch = usedSlots.indexOf(slot);
      const debounceMacro = ap.switchType === 'click'
        ? 'CLICK_DEBOUNCE_MS'
        : 'TOUCH_DEBOUNCE_MS';
      return `// ${ap.name} — ${ap.switchType === 'click' ? 'Click Switch' : 'Touch Switch'} (channel ${ch})
void IRAM_ATTR switch${ch + 1}ISR() {
  unsigned long now = millis();
  if (now - lastSwitchMs[${ch}] > ${debounceMacro}) {
    switchPending[${ch}] = true;
    lastSwitchMs[${ch}]  = now;
  }
}`;
    })
    .join('\n\n') + '\n';
}

function buildHelpers(usedSlots) {
  return `
// ─── Relay helpers ───────────────────────────────────────────────────────
// Active-LOW wiring: digitalWrite LOW = relay ON.

void applyRelay(int ch, bool on) {
  digitalWrite(CH_PIN[ch], on ? LOW : HIGH);
}

bool relayIsOn(int ch) {
  return digitalRead(CH_PIN[ch]) == LOW;
}

// Toggle from a physical switch. The relay reacts INSTANTLY (works fully
// offline); the new state is then pushed to RTDB. If the push fails the
// channel is marked pendingPush and retried from loop() until it lands.
void toggleChannel(int ch) {
  bool newOn = !relayIsOn(ch);
  applyRelay(ch, newOn);
  if (Firebase.ready() && Firebase.RTDB.setBool(&fbdo, CH_PATH[ch], newOn)) {
    pendingPush[ch] = false;
  } else {
    pendingPush[ch] = true;
    Serial.printf("[sync] %s toggle queued (offline) — will push when online\\n", CH_NAME[ch]);
  }
}

// ─── Firebase auth diagnostics ───────────────────────────────────────────
// Bounded retries + a clear serial message stop the endless sign-in storm
// that triggers Firebase's auth/too-many-requests lockout when credentials
// are wrong.
void onTokenStatus(TokenInfo info) {
  if (info.status == token_status_error) {
    Serial.printf("[auth] FAILED (code %d): %s\\n",
                  info.error.code, info.error.message.c_str());
    Serial.println("[auth] Check USER_EMAIL / USER_PASSWORD, then re-flash.");
  } else if (info.status == token_status_ready) {
    Serial.println("[auth] Firebase sign-in OK.");
  }
}

// ─── RTDB stream callbacks ───────────────────────────────────────────────
// The stream delivers (a) one full JSON snapshot on every (re)connect and
// (b) tiny per-key updates the instant the dashboard toggles something.

void applyStreamValue(const char* key, bool on) {
  for (int ch = 0; ch < CH_COUNT; ch++) {
    if (strcmp(key, CH_KEY[ch]) != 0) continue;
    if (pendingPush[ch]) return;            // local change is newer — keep it
    if (relayIsOn(ch) != on) {
      applyRelay(ch, on);
      Serial.printf("[rtdb] %s -> %s\\n", CH_NAME[ch], on ? "ON" : "OFF");
    }
    return;
  }
}

void streamCallback(FirebaseStream data) {
  if (data.dataTypeEnum() == firebase_rtdb_data_type_boolean) {
    // Delta: dataPath() is "/relayN"
    applyStreamValue(data.dataPath().c_str() + 1, data.boolData());
  } else if (data.dataTypeEnum() == firebase_rtdb_data_type_json) {
    // Initial snapshot (or multi-key update): sync every known channel.
    FirebaseJson* json = data.to<FirebaseJson*>();
    FirebaseJsonData item;
    for (int ch = 0; ch < CH_COUNT; ch++) {
      if (json->get(item, CH_KEY[ch]) && item.success) {
        applyStreamValue(CH_KEY[ch], item.boolValue);
      }
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) Serial.println("[rtdb] stream timed out — resuming…");
  if (!stream.httpConnected()) {
    Serial.printf("[rtdb] stream error %d: %s\\n",
                  stream.httpCode(), stream.errorReason().c_str());
  }
}
`;
}

function buildSetup(usedSlots, byRelay, physicalSlots) {
  // Only physical-switch slots get pinMode + attachInterrupt.
  // Input-only pins (34/35/36/39) have no internal pull-up → use INPUT.
  // (TTP223 modules drive the line push-pull, so no external pull-up needed;
  // a mechanical click switch on these pins DOES need an external pull-up.)
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

  // ─── Relay outputs (start OFF; RTDB snapshot restores state on connect) ─
  for (int ch = 0; ch < CH_COUNT; ch++) {
    pinMode(CH_PIN[ch], OUTPUT);
    digitalWrite(CH_PIN[ch], HIGH);
  }

${physicalSlots.length ? `  // ─── Switch inputs + interrupts ───────────────────────────────────────\n${switchInit}` : '  // (no physical switches wired — control is app-only)'}

  // ─── Wi-Fi ────────────────────────────────────────────────────────────
  // setSleep(false): modem-sleep causes spurious interrupts on GPIO 36/39
  // (ESP32 errata) AND adds latency — always disable it on relay boards.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_BOOT_TIMEOUT_MS) {
      Serial.println("\\nWi-Fi failed — check SSID/password. Restarting in 5 s…");
      delay(5000);
      ESP.restart();
    }
    Serial.print('.');
    delay(250);
  }
  Serial.printf(" connected (%s).\\n", WiFi.localIP().toString().c_str());

  // ─── Firebase ─────────────────────────────────────────────────────────
  config.api_key       = API_KEY;
  config.database_url  = DATABASE_URL;
  auth.user.email      = USER_EMAIL;
  auth.user.password   = USER_PASSWORD;
  // Bounded sign-in retries + status callback: with wrong credentials the
  // device logs a clear error and stops, instead of hammering Firebase Auth
  // until the account is rate-limited (auth/too-many-requests).
  config.max_token_generation_retry = 5;
  config.token_status_callback      = onTokenStatus;
  // Right-sized TLS buffers (default 16 KB rx eats RAM for no benefit here).
  fbdo.setBSSLBufferSize(2048, 1024);
  stream.setBSSLBufferSize(2048, 1024);
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // ─── Live RTDB stream (instant push — no polling) ─────────────────────
  if (!Firebase.RTDB.beginStream(&stream, RTDB_RELAYS_BASE)) {
    Serial.printf("[rtdb] stream begin failed: %s\\n", stream.errorReason().c_str());
  }
  Firebase.RTDB.setStreamCallback(&stream, streamCallback, streamTimeoutCallback);

  Serial.println("Setup complete — waiting for Firebase token…");
}
`;
}

function buildLoop(usedSlots, byRelay, physicalSlots) {
  // Dispatch each physical-switch's pending flag by CHANNEL index.
  const isrDispatch = physicalSlots
    .map((slot) => {
      const ch = usedSlots.indexOf(slot);
      return `  if (switchPending[${ch}]) { switchPending[${ch}] = false; toggleChannel(${ch}); }`;
    })
    .join('\n');

  return `unsigned long lastPushRetry = 0;
unsigned long wifiLostSince  = 0;

void loop() {
  // 1. Physical switches — relays react instantly, even with no internet.
${isrDispatch || '  // (no physical switches — nothing to dispatch)'}

  // 2. Re-push local toggles that happened while offline (RTDB catch-up).
  if (Firebase.ready() && millis() - lastPushRetry >= PENDING_PUSH_RETRY_MS) {
    lastPushRetry = millis();
    for (int ch = 0; ch < CH_COUNT; ch++) {
      if (pendingPush[ch] && Firebase.RTDB.setBool(&fbdo, CH_PATH[ch], relayIsOn(ch))) {
        pendingPush[ch] = false;
        Serial.printf("[sync] %s pushed after reconnect\\n", CH_NAME[ch]);
      }
    }
  }

  // 3. Wi-Fi watchdog — if the network stays gone too long, a clean restart
  //    recovers stuck TLS sessions. Physical switches keep working meanwhile.
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiLostSince == 0) wifiLostSince = millis();
    else if (millis() - wifiLostSince > WIFI_LOST_RESTART_MS) {
      Serial.println("Wi-Fi lost too long — restarting.");
      ESP.restart();
    }
  } else {
    wifiLostSince = 0;
  }
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════
//   HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Wrap a string as a safe C string literal (escapes backslash and quote). */
function escapeC(s) {
  return '"' + escapeForC(s) + '"';
}

/** Escape for embedding inside an existing C string literal (no quotes added). */
function escapeForC(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
