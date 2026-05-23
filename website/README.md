# Home Automation Web Platform

Multi-tenant home automation system. Admin manages users and their houses; each user controls only their own appliances. Backed by Firebase (Auth + Realtime DB), works with the existing ESP32 firmware unchanged.

## Folder Structure

```
HomeAutomationWebsite/
├── backend/          Node.js + Express + Firebase Admin SDK
└── frontend/         React + Vite + Tailwind CSS
```

## Firebase DB Schema

```
/persons/{personId}                  (personId = Firebase Auth uid)
  - name, email, contact, role ("user" | "admin")
  - houseIds: { houseId1: true, ... }       ← reverse index
  - createdAt

/houses/{houseId}                    (auto-generated push key)
  - name, location
  - contactPersons: { personId1: true, ... }
  - createdAt

/houses/{houseId}/rooms/{roomId}
  - name, order

/houses/{houseId}/rooms/{roomId}/appliances/{applianceId}
  - name, icon, relayPath  ← e.g. "/relay1" or "/devices/ESP32_001/relay1"

/relay1 .. /relay4         LEGACY paths — existing .ino keeps writing/reading here
/devices/{deviceId}/relays/relay1..4   NEW per-device paths (future-proof)
```

**Many-to-many:** A house has a `contactPersons` map (anyone in it can control the appliances). A person has a `houseIds` map (the houses they can access). Admin manages both sides and links them.

## Setup

### 1. Firebase project preparation

You already have a Firebase project (`home-automation-a86aa`). You need:

1. **Service Account Key** (for backend Admin SDK):
   - Firebase Console → Project Settings → Service Accounts → "Generate new private key"
   - Save the downloaded JSON as `backend/firebase-service-account.json`
2. **Web Config** (for frontend):
   - Project Settings → General → "Your apps" → Web app config
   - Copy `apiKey`, `authDomain`, `databaseURL`, `projectId`, etc.

### 2. Backend

```powershell
cd D:\Web\HomeAutomationWebsite\backend
npm install
copy .env.example .env
# edit .env: set ADMIN_EMAIL, DATABASE_URL
npm run dev
```

Backend runs at http://localhost:5000

### 3. Frontend

```powershell
cd D:\Web\HomeAutomationWebsite\frontend
npm install
copy .env.example .env
# edit .env with your Firebase web config
npm run dev
```

Frontend runs at http://localhost:5173

### 4. Make yourself admin

After the backend starts the first time, run this once to grant admin role to your email:

```powershell
cd backend
node scripts/make-admin.js YOUR_FIREBASE_EMAIL
```

This sets the `admin: true` custom claim and creates `/users/{yourUid}/role = "admin"` in the DB.

## ESP32 Integration (do later — DO NOT MODIFY .INO YET)

The new schema is backward-compatible. Your current `4DeviceSwitchControl.ino` writes to `/relay1..4` — and the web UI also points to `/relay1..4` for your house's appliances. So **everything just works** without firmware changes.

When you're ready to support multiple ESP32 devices (one per house), we'll:

1. Migrate to `/devices/{deviceId}/relays/relayN` paths
2. Add a `deviceId` define in the .ino so each ESP32 knows its own path prefix
3. Create a dedicated Firebase Auth "device account" per ESP32 (so user password changes never break firmware)

For now, the website uses your existing `/relay1..4` paths. **No .ino changes needed.**

## User Flow

1. New user signs up → backend creates `/users/{uid}` + `/houses/{houseId}` with empty rooms
2. Admin (you) signs in → sees Admin Dashboard with all users + can CRUD their houses/rooms/appliances
3. Regular user signs in → sees their House Dashboard with horizontal-scroll room tabs; click a room → see appliance toggles
4. Each appliance toggle writes to its configured `relayPath` in Firebase → ESP32 reacts in real time
