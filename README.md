# Home Automation

End-to-end IoT home automation system: ESP32-based relay controller with capacitive touch
inputs + a multi-tenant web dashboard backed by Firebase (Firestore + Realtime Database).

**Live demo:** https://chitrang313.github.io/Home-Automation/

> ⚠️ **Note:** The live URL serves the static React frontend only. Sign-up / login / admin
> features require the Node.js backend deployed separately — see [Deployment](#deployment).

---

## Repository Structure

```
Home-Automation/
├── firmware/
│   ├── 4DeviceSwitchControl/             TTP223 capacitive touch + relay — PRODUCTION ✅
│   ├── 4DeviceButtonControl/             Push-button + relay (toggle on release)
│   ├── NeoPixel_Test/                    WS2812B LED strip test sketch
│   └── WebUI_ESP32_Firebase_4Relay_V1/   Legacy single-page web UI (reference only)
│
├── website/
│   ├── backend/                          Node.js + Express + Firebase Admin SDK
│   └── frontend/                         React 18 + Vite + Tailwind CSS + React Router v6
│
└── .github/workflows/                    CI/CD — GitHub Pages deploy for frontend
```

---

## System Architecture

### Two-Database Design (Firestore + RTDB)

The system splits data across two Firebase databases with clearly separated responsibilities:

```
┌────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│           FIRESTORE                │   │        REALTIME DATABASE (RTDB)         │
│   structured, queryable metadata   │   │   live relay state — booleans only      │
├────────────────────────────────────┤   ├─────────────────────────────────────────┤
│  persons, houses, rooms,           │   │  /devices/{deviceId}/relays/            │
│  boards, appliances                │   │    relay1 : true / false                │
│                                    │   │    relay2 : true / false  ...           │
│  Written by : Node.js backend      │   │                                         │
│  Read by    : React dashboard      │   │  Written by : Frontend (app toggle)     │
│  ESP32      : never reads this     │   │               ESP32 (physical touch)    │
│                                    │   │  Read by    : ESP32 → fires GPIO        │
│                                    │   │               Frontend → live UI state  │
└────────────────────────────────────┘   └─────────────────────────────────────────┘
```

**Why this split?**

- Firestore gives rich queries, per-field security rules, and offline support for
  structural data that rarely changes.
- RTDB uses a persistent binary WebSocket (~30–80 ms latency) — ideal for
  sub-100 ms relay toggles where only a boolean needs to move.
- The ESP32 only ever watches a handful of booleans; it never needs to know house names,
  room names, or appliance names.

---

## Firestore Schema

```
persons (collection)
└── {uid} (document)
      name        : "Alpesh"
      contact     : "98765XXXXX"      ← stored; never exposed in public responses
      role        : "user" | "admin"
      createdAt   : timestamp
      houseIds    : { houseId : true } ← reverse-index, fast membership check

houses (collection)
└── {houseId} (document)
      name            : "Ami Kunj"
      location        : "Surat"
      createdAt       : timestamp
      contactPersons  : { uid : true }

    ── rooms (subcollection)
    └── {roomId} (document)
          name   : "Hall"
          floor  : "Ground"

        ── boards (subcollection)
        └── {boardId} (document)
              deviceId            : "-NxKjP2mAbc3"  ← links RTDB path + generated .ino
              relayCount          : 4 | 8            ← auto-set from appliance count
              lastDownloadAt      : timestamp | null
              firmwareNeedsUpdate : true | false      ← set when relay config changes

        ── appliances (subcollection)
        └── {appId} (document)
              name        : "Fan1"          ← display label; safe to rename anytime
              icon        : "fan"           ← visual icon; safe to change anytime
              type        : "fan"           ← functional category (fixed at creation)
              boardId     : "{boardId}"
              relaySlot   : "relay1".."relay8"
              switchType  : "touch" | "click" | "none"
```

---

## RTDB Schema

```
devices
└── {deviceId}
      relays
        relay1 : false
        relay2 : true
        ...
        relay8 : false
```

**That is the entire RTDB tree.** All structural metadata stays in Firestore.

> **Legacy paths** `/relay1`..`/relay4` remain in RTDB until all boards are reflashed
> with the new per-device firmware. They are removed via the cleanup script afterward.

---

## Firmware

### Production Sketch

`firmware/4DeviceSwitchControl/4DeviceSwitchControl.ino`

- ESP32 DevKIT V1 + 4-channel 5V active-LOW relay module
- 4× TTP223 capacitive touch sensors (A-pad bridged → active-LOW momentary)
- Hardware interrupts (`FALLING` edge, `IRAM_ATTR` ISRs) — tap detection regardless of
  Firebase blocking in the main loop
- 150 ms software debounce per channel
- RTDB polled every 500 ms to apply remote changes from the dashboard
- **Do not modify this file** — it is the reference template for the firmware generator

### Relay Board Support

| Board type | Channels | Max appliances per ESP32 |
|---|---|---|
| 4-channel relay module | 4 | 4 |
| 8-channel relay module | 8 | 8 |

The system **auto-selects** the board type from appliance count per board:

| Appliance count | Board type chosen | Warning shown |
|---|---|---|
| 1 – 4 | 4-channel firmware | — |
| 5 – 8 | 8-channel firmware | ⚠ Upgrade required — re-flash needed |
| 9+ | Second board required | ⚠ New board auto-created |

Downgrading (removing appliances below 5) suggests — but never forces — a switch back
to the 4-channel firmware.

### Firmware Generation (Download Button)

Admin never edits a `.ino` file by hand. The flow:

```
1. Admin creates House → Room → Appliances in the dashboard
2. Each Room has one or more Boards (one per physical switchboard location)
3. Admin assigns each appliance to a relay slot + switch type via the visual slot editor
4. Admin clicks [⬇ Download Firmware] on a board card
5. Modal asks: Wi-Fi SSID + Wi-Fi Password
6. Backend generates a fully-configured .ino → browser downloads it
7. Admin opens Arduino IDE → flashes to ESP32 → installs in switchboard
```

**Generated filename:** `AmiKunj_Hall_Board1.ino`

**What is injected at download time:**

| Field | Source |
|---|---|
| `DEVICE_ID` | Auto-generated at board creation — permanent, never changes |
| `WIFI_SSID` / `WIFI_PASS` | Entered in the download modal |
| Firebase host + API key | Backend environment variables |
| Firebase auth credentials | Dedicated non-admin ESP32 device account |
| RTDB relay paths | `/devices/{deviceId}/relays/relay1..8` |
| GPIO pin definitions | Based on 4-ch or 8-ch relay board template |
| ISR setup per relay | Conditional on `switchType` (see below) |

**Firmware update badge** (`🔴 Update Available`) appears when:
- Appliance added or removed from the board
- Relay slot assignment changed
- Switch type changed

The badge does **not** appear for appliance renames or icon changes — those are cosmetic
and the ESP32 is unaffected.

### Appliance Switch Types

| Type | Hardware | Firmware |
|---|---|---|
| **Touch Switch** *(default)* | TTP223 capacitive sensor | `FALLING` ISR, 150 ms debounce |
| **Click Switch** | Mechanical push button | `FALLING` ISR, 50 ms debounce |
| **None** (app only) | No physical switch | No ISR, no input GPIO allocated |

### Appliance Rename & Icon Change

Names and icons are **cosmetic Firestore fields only**. Renaming is always safe:

- RTDB paths use `deviceId + relaySlot` — never the appliance name
- Rename → Firestore updated → all dashboards reflect change instantly (real-time)
- Generated `.ino` header comments update on next download, relay logic unchanged
- Both users and admin can rename; only admin can change relay slot or switch type

---

## Website

Multi-tenant dashboard:

- A **person** can be linked to multiple houses
- A **house** can have multiple contact persons
- An **admin** manages all persons, houses, rooms, boards, and appliances
- A **user** sees only their linked houses; can control appliances and rename/re-icon them

See [`website/README.md`](website/README.md) for full setup, API routes, schema detail,
and local development instructions.

---

## UI/UX Features

### Find / Search Filter

Available on both the User Dashboard and Admin Dashboard. Three cascading searchable
dropdowns with AND logic:

```
[ 🏠 House ▼ ]   [ 🚪 Room ▼ ]   [ ⚡ Appliance Type ▼ ]
```

- All three fields are **comboboxes** — type to filter the list OR click to pick
- Room dropdown **cascades**: if a house is selected only that house's rooms are shown
- Active filters displayed as removable chips with a live result count badge
- Results switch to a **flat card view** with house › room breadcrumbs + live toggle
- Mobile: filter panel collapses; active-filter count shown as a badge on the toggle button

### Appliance Cards

- Long-press or ··· menu → **Edit Appliance** modal (name + icon picker)
- Toggle works directly from search result cards — no page navigation needed
- 44 px minimum touch targets throughout

---

## Deployment

### Frontend (automatic via GitHub Actions)

Every push to `main` triggers `.github/workflows/deploy.yml`:

1. Installs `website/frontend` dependencies
2. Builds with `npm run build` (Firebase config from GitHub Secrets)
3. Publishes `dist/` to the `gh-pages` branch
4. GitHub Pages serves at https://chitrang313.github.io/Home-Automation/

**One-time GitHub Secrets setup:**

| Secret | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | RTDB URL |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_API_URL` | Backend URL + `/api` suffix |

### Backend (Firebase Cloud Functions — recommended)

```powershell
npm install -g firebase-tools
firebase login
firebase use          # verifies .firebaserc is wired to your project
firebase functions:secrets:set ADMIN_EMAIL
firebase deploy --only functions
```

After deploy the CLI prints the function URL. Set it as `VITE_API_URL` in GitHub Secrets
and re-run the frontend workflow.

> Cloud Functions Gen 2 requires the Blaze plan. Personal dashboard usage is well within
> the free quota (~$0/month).

### Backend (Vercel — alternative, free forever, no credit card)

```
Root Directory : website/backend
Framework      : Other
Build Command  : (leave empty)
Output Dir     : (leave empty)
```

Environment variables in Vercel:

| Name | Value |
|---|---|
| `DATABASE_URL` | Firebase RTDB URL |
| `ADMIN_EMAIL` | Admin Firebase Auth email |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON from `firebase-service-account.json` |
| `CORS_ORIGIN` | `https://chitrang313.github.io` |

Verify: `GET https://<backend>.vercel.app/api/health` → `{ "ok": true }`

### RTDB Security Rules

Strict default-deny rules live in [`database.rules.json`](database.rules.json).

```powershell
# Deploy via CLI
firebase deploy --only database
```

Or paste into Firebase Console → Realtime Database → Rules.

Rules enforce:
- `/persons/*` — user reads own record; admin reads all; only admin writes
- `/houses/{houseId}` — read/write by `contactPersons` members or admin
- `/houses/{houseId}/rooms/**` and `/relays/**` — same as parent house
- `/devices/{deviceId}/relays/*` — any authenticated user (ESP32 device account qualifies)
- `/relay1..4` — any authenticated user (legacy; removed after full firmware migration)

### Firmware (manual flash via Arduino IDE)

1. Download the generated `.ino` from the admin dashboard (or use
   `4DeviceSwitchControl.ino` for legacy boards)
2. Open in Arduino IDE 2.x
3. Select ESP32 Dev Module board + correct COM port
4. Flash

Credentials are injected at generation time. **Never commit credentials to git.**

**Required Arduino libraries:**
- `Firebase_ESP_Client` by Mobizt ≥ 4.4.17
- `ArduinoJson` ≥ 7.4.1

---

## Local Development

See [`website/README.md`](website/README.md) for step-by-step backend + frontend setup.

---

## Database Cleanup Script

Removes legacy test paths (`/F1`, `/L1`, `/users`, `/test`) left from early development:

```powershell
cd D:\Web\HomeAutomationWebsite\website\backend
node scripts/cleanup-rtdb.js          # dry-run — lists what would change
node scripts/cleanup-rtdb.js --apply  # actually delete
```

Keeps `/persons`, `/houses`, `/devices`, and `/relay1..4` untouched.
