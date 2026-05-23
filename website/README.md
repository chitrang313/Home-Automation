# Home Automation — Web Platform

Multi-tenant home automation dashboard. Admin manages persons, houses, rooms, boards, and
appliances. Users control only their linked houses in real time via Firebase.

---

## Folder Structure

```
website/
├── backend/
│   ├── app.js                      Express app (shared entry — Vercel + Functions)
│   ├── index.js                    Firebase Cloud Functions entry point
│   ├── server.js                   Local dev server (nodemon)
│   ├── vercel.json                 Vercel serverless config
│   ├── package.json
│   ├── .env.example                Required environment variable template
│   └── src/
│       ├── firebase-admin.js       Firebase Admin SDK initialisation (3-mode)
│       ├── middleware/
│       │   └── auth.js             verifyAuth — validates Firebase ID token
│       └── routes/
│           ├── auth.js             POST /signup
│           ├── persons.js          GET /me, CRUD /persons
│           ├── houses.js           CRUD /houses, rooms, boards, appliances
│           └── firmware.js         GET /houses/:id/boards/:bid/firmware  [planned]
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx                 Routes + AuthProvider wrapper
        ├── firebase.js             Firebase client SDK init
        ├── contexts/
        │   └── AuthContext.jsx     firebaseUser, person, isAdmin, login, logout
        ├── services/
        │   └── api.js              Typed fetch wrapper for all backend calls
        ├── components/
        │   ├── Navbar.jsx          Desktop nav + mobile burger drawer
        │   ├── ApplianceCard.jsx   Toggle card with rename/icon-edit support
        │   └── SearchFilter.jsx    Cascading combobox filter (House/Room/Type)
        └── pages/
            ├── Login.jsx
            ├── Signup.jsx
            ├── Profile.jsx
            ├── UserDashboard.jsx
            └── AdminDashboard.jsx
```

---

## Architecture

### Two-Database Split

| Layer | Database | What lives here |
|---|---|---|
| Structural metadata | **Firestore** | persons, houses, rooms, boards, appliances |
| Live relay state | **RTDB** | `/devices/{deviceId}/relays/relay1..8` |

The ESP32 only ever reads/writes the RTDB relay booleans. It never touches Firestore.
The React frontend reads appliance metadata from Firestore and subscribes to relay state
from RTDB — two separate listeners working in parallel.

### Authentication & Roles

- Firebase Auth — email/password
- Custom claim `admin: true` set by backend on the designated `ADMIN_EMAIL`
- `verifyAuth` middleware validates the Firebase ID token on every protected route
- Permanent admin self-heal: `/me` re-grants the admin claim if it is ever missing for
  the `ADMIN_EMAIL` account, then signals the client to force-refresh the token

---

## Firestore Schema (Full)

```
────────────────────────────────────────────────────────────────────
COLLECTION: persons
────────────────────────────────────────────────────────────────────
{uid}
  name        : string          — display name
  contact     : string          — phone number (never exposed publicly)
  role        : "user"|"admin"
  createdAt   : timestamp
  houseIds    : map<houseId, true>   — reverse-index for O(1) membership check

────────────────────────────────────────────────────────────────────
COLLECTION: houses
────────────────────────────────────────────────────────────────────
{houseId}
  name            : string
  location        : string
  createdAt       : timestamp
  contactPersons  : map<uid, true>

  ── SUBCOLLECTION: rooms
  {roomId}
    name   : string
    floor  : string

    ── SUBCOLLECTION: boards
    {boardId}
      deviceId            : string     — auto-generated Firebase push key (permanent)
      relayCount          : 4 | 8      — auto-set: ≤4 apps → 4, 5–8 apps → 8
      lastDownloadAt      : timestamp | null
      firmwareNeedsUpdate : boolean    — true when relay config changes post-download

    ── SUBCOLLECTION: appliances
    {appId}
      name        : string    — display label; rename freely, does not affect relays
      icon        : string    — icon key (e.g. "fan", "light"); change freely
      type        : string    — functional category set at creation (fan/light/ac…)
      boardId     : string    — ref to boards/{boardId}
      relaySlot   : string    — "relay1".."relay8"
      switchType  : "touch" | "click" | "none"
```

---

## RTDB Schema (Full)

```
devices
└── {deviceId}
      relays
        relay1 : boolean
        relay2 : boolean
        ...
        relay8 : boolean
```

Relay nodes are created automatically by the backend when firmware is first downloaded
(initialised to `false`). The ESP32 updates them on physical touch; the frontend updates
them on app toggle. No manual console setup required.

---

## Board & Device System

### Concept

A **Board** is one physical ESP32 + relay module installed in a specific location inside
a room. One room can have multiple boards (e.g. two switchboards on opposite walls).

```
House: Ami Kunj
└── Room: Hall
    ├── Board 1  (deviceId: -NxKjP2mAbc3, 4-ch)
    │     relay1 → Fan1        [Touch Switch]
    │     relay2 → Light1      [Click Switch]
    │     relay3 → AC          [Touch Switch]
    │     relay4 → Exhaust     [Touch Switch]
    └── Board 2  (deviceId: -PqrStu9Xyz7, 4-ch)
          relay1 → Geyser      [None — app only]
          relay2 → Curtain     [Touch Switch]
```

### Auto Relay-Count Selection

The backend sets `relayCount` automatically — admin never picks it manually:

| Appliances on board | relayCount | Action |
|---|---|---|
| 1 – 4 | 4 | — |
| 5 | 8 | ⚠ Upgrade warning shown; re-flash required |
| 5 → 4 (remove) | 4 (optional) | ℹ Downgrade suggestion (not forced) |
| 9+ | 8 + new board | ⚠ Second board auto-created |

### Visual Slot Editor

Admin assigns appliances to relay slots via a drag-select UI on each board card:

```
Board 1  •  4-Channel
  relay1  [ Fan1    ▼ ]  [ Touch Switch  ▼ ]
  relay2  [ Light1  ▼ ]  [ Click Switch  ▼ ]
  relay3  [ AC      ▼ ]  [ Touch Switch  ▼ ]
  relay4  [ Exhaust ▼ ]  [ Touch Switch  ▼ ]

                         [⬇ Download Firmware]
```

---

## Appliance Switch Types

| Value | Hardware | ISR setup in generated .ino |
|---|---|---|
| `"touch"` | TTP223 capacitive sensor (A-pad bridged) | `FALLING`, 150 ms debounce |
| `"click"` | Mechanical momentary push button | `FALLING`, 50 ms debounce |
| `"none"` | No physical switch | No `attachInterrupt`, no input `pinMode` |

The `none` type is ideal for appliances controlled only from the app (geyser, motorised
curtain, etc.) where wiring a wall switch is impractical.

---

## Firmware Generation

### Endpoint (planned)

```
GET /api/houses/:houseId/boards/:boardId/firmware
    ?ssid=<wifi-name>&pass=<wifi-password>
```

Returns a `.ino` file with all configuration pre-filled.

### What is generated

```cpp
/**
 * ╔══════════════════════════════════════════════════════╗
 * ║           HOME AUTOMATION FIRMWARE                   ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  House     : Ami Kunj                                ║
 * ║  Room      : Hall                                    ║
 * ║  Board     : Board 1  (4-Channel)                    ║
 * ║  Device ID : -NxKjP2mAbc3    ← do not change        ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  Contact Persons : Alpesh                            ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  RELAY MAP                                           ║
 * ║  relay1 (GPIO 23) → Fan1      [Touch Switch]         ║
 * ║  relay2 (GPIO 19) → Light1    [Click Switch]         ║
 * ║  relay3 (GPIO 18) → AC        [Touch Switch]         ║
 * ║  relay4 (GPIO 5 ) → Exhaust   [Touch Switch]         ║
 * ╠══════════════════════════════════════════════════════╣
 * ║  Generated  : 15 Jan 2026 10:30 AM                   ║
 * ║  Flash ONLY to the ESP32 in "Hall" of "Ami Kunj"     ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * ⚠ Contains Wi-Fi credentials. Do NOT share or commit.
 */
```

### Firmware update badge

`firmwareNeedsUpdate` is set to `true` by the backend whenever:
- Appliance added or removed from the board
- Relay slot changed
- Switch type changed

It is **not** set for appliance renames or icon changes (cosmetic — ESP32 unaffected).

The frontend shows a `🔴 Update Available` badge on the Download Firmware button and
displays the date of the last download.

---

## Appliance Rename & Icon Change

Renaming is safe at any time because the ESP32 and RTDB paths are keyed on
`deviceId + relaySlot`, not on the appliance name.

```
User renames "Fan1" → "Master Bedroom Fan"
  Firestore: appliances/{appId}.name updated
  RTDB:      /devices/-NxKjP2mAbc3/relays/relay1  ← unchanged
  ESP32:     unaffected — still listens on same GPIO
  All dashboards: update in real time via Firestore listener
  Next .ino download: header comments show new name; relay logic identical
```

**Permissions:**

| Action | User | Admin |
|---|---|---|
| Rename appliance in own house | ✅ | ✅ |
| Change icon in own house | ✅ | ✅ |
| Change relay slot | ❌ | ✅ |
| Change switch type | ❌ | ✅ |
| Rename in any house | ❌ | ✅ |

---

## UI Features

### Search / Find Filter

Three cascading searchable dropdowns on both User and Admin dashboards:

```
[ 🏠 House ▼ ]   [ 🚪 Room ▼ ]   [ ⚡ Appliance Type ▼ ]
```

- All fields are **comboboxes**: type to filter or click to pick from the list
- Room dropdown cascades — selecting a house restricts rooms to that house only
- AND logic: each active filter narrows the result set further
- Active filters shown as removable chips; count badge shows `X of Y appliances`
- Results display as a flat card list with house › room breadcrumbs + live toggle
- Mobile: panel collapses; badge shows number of active filters
- Empty state: contextual message + Clear Filters shortcut

### Appliance Card Actions

- Toggle ON/OFF (real-time RTDB write)
- ··· menu or long-press → Edit modal (rename + icon picker)
- Admin cards additionally show Edit relay config + Delete

---

## Backend API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/signup` | — | Create Firebase Auth user + Firestore person record |
| `GET` | `/api/me` | user | Get own person profile + admin self-heal |
| `GET` | `/api/persons` | admin | List all persons |
| `GET` | `/api/persons/:id` | admin | Get one person |
| `PUT` | `/api/persons/:id` | admin | Update person |
| `DELETE` | `/api/persons/:id` | admin | Delete person |
| `GET` | `/api/houses` | admin | List all houses |
| `POST` | `/api/houses` | admin | Create house |
| `PUT` | `/api/houses/:id` | admin | Update house |
| `DELETE` | `/api/houses/:id` | admin | Delete house |
| `POST` | `/api/houses/:id/link` | admin | Link person to house |
| `POST` | `/api/houses/:id/unlink` | admin | Unlink person from house |
| `GET` | `/api/houses/:id/rooms` | member | List rooms |
| `POST` | `/api/houses/:id/rooms` | admin | Create room |
| `PUT` | `/api/houses/:id/rooms/:rid` | admin | Update room |
| `DELETE` | `/api/houses/:id/rooms/:rid` | admin | Delete room |
| `GET` | `/api/houses/:id/rooms/:rid/boards` | member | List boards |
| `POST` | `/api/houses/:id/rooms/:rid/boards` | admin | Create board (auto-generates deviceId + RTDB nodes) |
| `GET` | `/api/houses/:id/rooms/:rid/appliances` | member | List appliances |
| `POST` | `/api/houses/:id/rooms/:rid/appliances` | admin | Create appliance |
| `PUT` | `/api/houses/:id/rooms/:rid/appliances/:aid` | member* | Update appliance (name/icon for members; all fields for admin) |
| `DELETE` | `/api/houses/:id/rooms/:rid/appliances/:aid` | admin | Delete appliance |
| `GET` | `/api/houses/:hid/rooms/:rid/boards/:bid/firmware` | admin | Generate + download .ino |
| `GET` | `/api/health` | — | Health check |

---

## Setup

### Prerequisites

- Node.js ≥ 20
- Firebase project with Auth + Firestore + Realtime Database enabled
- Firebase service account key JSON (for backend Admin SDK)

### 1. Firebase Preparation

1. **Service Account Key** (backend):
   Firebase Console → Project Settings → Service Accounts → Generate new private key →
   save as `website/backend/firebase-service-account.json`
   *(gitignored — never commit this file)*

2. **Firestore** — enable in Firebase Console → Firestore Database → Create database

3. **Realtime Database** — enable in Firebase Console → Realtime Database → Create database

4. **Web App Config** (frontend):
   Project Settings → General → Your apps → Web app → copy the config object

5. **Dedicated ESP32 Firebase Auth account** (for firmware):
   Firebase Console → Authentication → Users → Add User →
   use a non-admin email (e.g. `esp32-device@your-domain.com`) + strong random password.
   Store the password as a backend environment variable (`ESP32_DEVICE_PASSWORD`).

### 2. Backend

```powershell
cd D:\Web\HomeAutomationWebsite\website\backend
npm install
copy .env.example .env
```

Edit `.env`:

```
DATABASE_URL=https://<your-project>-default-rtdb.firebaseio.com
ADMIN_EMAIL=<your-admin-email>
CORS_ORIGIN=http://localhost:5173
ESP32_DEVICE_EMAIL=esp32-device@your-domain.com
ESP32_DEVICE_PASSWORD=<strong-random-password>
# For local dev only — on Vercel/Functions use env vars instead:
# FIREBASE_SERVICE_ACCOUNT_JSON=<paste JSON here>
```

Start dev server:

```powershell
npm run dev   # nodemon — auto-restarts on changes
```

Backend runs at `http://localhost:5000`

### 3. Frontend

```powershell
cd D:\Web\HomeAutomationWebsite\website\frontend
npm install
copy .env.example .env
```

Edit `.env` with your Firebase web app config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_URL=http://localhost:5000/api
```

Start dev server:

```powershell
npm run dev
```

Frontend runs at `http://localhost:5173`

### 4. Grant Admin Role

After the backend starts the first time, run once to set the admin custom claim:

```powershell
cd D:\Web\HomeAutomationWebsite\website\backend
node scripts/make-admin.js <your-admin-email>
```

The `/me` endpoint also auto-heals the admin claim on every login for `ADMIN_EMAIL`, so
this step is a one-time safety net.

### 5. Deploy RTDB Security Rules

```powershell
cd D:\Web\HomeAutomationWebsite
firebase deploy --only database
```

---

## Database Cleanup

Remove legacy test paths from RTDB (`/F1`, `/L1`, `/users`, `/test`):

```powershell
cd D:\Web\HomeAutomationWebsite\website\backend
node scripts/cleanup-rtdb.js          # dry-run
node scripts/cleanup-rtdb.js --apply  # execute
```

---

## ESP32 Firebase Auth Account

All generated firmware files use a single shared Firebase Auth account
(`ESP32_DEVICE_EMAIL`) — never the admin account. Benefits:

- Admin password changes do not break any running ESP32
- If the device credential is compromised, reset that account only
- All boards authenticate with the same credential but write to their own isolated
  RTDB path (`/devices/{uniqueDeviceId}/relays/*`)
