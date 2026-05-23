# Home Automation

End-to-end IoT home automation system: ESP32-based 4-channel relay controller with capacitive touch inputs + a multi-tenant web dashboard.

**Live demo:** https://chitrang313.github.io/Home-Automation/

> ⚠️ **Note:** The live URL serves only the static React frontend. Sign-up / login / admin features require the Node.js backend, which must be deployed separately (see [Deployment](#deployment) below).

## Repository Structure

```
Home-Automation/
├── firmware/                          ← Arduino .ino sketches for ESP32
│   ├── 4DeviceButtonControl/          Push-button + relay (toggle on release)
│   ├── 4DeviceSwitchControl/          TTP223 capacitive touch + relay (interrupt-driven)
│   ├── NeoPixel_Test/                 WS2812B test sketch
│   └── WebUI_ESP32_Firebase_4Relay_V1/  Legacy single-page web UI (kept for reference)
│
├── website/                           ← Multi-tenant dashboard
│   ├── backend/                       Node.js + Express + Firebase Admin SDK
│   └── frontend/                      React 18 + Vite + Tailwind + React Router v6
│
└── .github/workflows/                 CI/CD (GitHub Pages deploy for frontend)
```

## Firmware

ESP32 controls 4 relay channels and reads 4 TTP223 capacitive touch sensors (each in A-pad bridge config = momentary, active-LOW). Touch is captured via hardware interrupt for instant response. State syncs in real time with Firebase RTDB.

See [`firmware/4DeviceSwitchControl/4DeviceSwitchControl.ino`](firmware/4DeviceSwitchControl/4DeviceSwitchControl.ino) for the current production sketch.

**Required libraries:**
- `Firebase_ESP_Client` by Mobizt v4.4.17
- `ArduinoJson` v7.4.1

## Website

Multi-tenant dashboard where each house has its own data, multiple persons can control a single house, and a single admin manages everything.

See [`website/README.md`](website/README.md) for full setup, schema, and architecture.

## Deployment

### Frontend (automatic, via GitHub Actions)

Every push to `main` triggers `.github/workflows/deploy.yml`, which:
1. Installs `website/frontend` dependencies
2. Builds with `npm run build` (using GitHub Secrets for Firebase config)
3. Publishes the `dist/` output to the `gh-pages` branch
4. GitHub Pages serves it at https://chitrang313.github.io/Home-Automation/

**Setup (one-time):**
1. Go to **Settings → Pages** and set source to **`gh-pages` branch / root**
2. Go to **Settings → Secrets and variables → Actions** and add:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_API_URL` (the URL where your backend is deployed — see below)

### Backend (Vercel — free forever, no credit card)

The Express backend is configured to deploy as a Vercel serverless function via `website/backend/vercel.json`. Vercel's free Hobby tier has no time limit, requires no credit card, and gives 100 GB bandwidth + 100 GB-hours of compute per month — far more than a personal dashboard needs.

**One-time setup:**

1. Go to https://vercel.com and sign up with GitHub (no credit card)
2. Click **"Add New… → Project"**
3. Import `chitrang313/Home-Automation`
4. **Configure:**
   - **Root Directory:** click *Edit* and set to `website/backend`
   - **Framework Preset:** *Other* (Vercel auto-detects Node)
   - **Build Command:** leave empty
   - **Output Directory:** leave empty
5. **Environment Variables** — add these four:

| Name | Value |
|------|-------|
| `DATABASE_URL` | `https://home-automation-a86aa-default-rtdb.firebaseio.com` |
| `ADMIN_EMAIL` | `chitrang313@gmail.com` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *paste the entire contents of `firebase-service-account.json`* |
| `CORS_ORIGIN` | `https://chitrang313.github.io` |

6. Click **Deploy**. After ~30 seconds you'll get a URL like `https://home-automation-backend-xxx.vercel.app`
7. Test it: open `https://home-automation-backend-xxx.vercel.app/api/health` — should return `{"ok":true,"ts":...}`

**Auto-deploys:** Vercel watches `main` branch — every push redeploys the backend automatically.

**Connect frontend to it:**
1. GitHub → repo → Settings → Secrets and variables → Actions
2. Update (or add) `VITE_API_URL` to: `https://home-automation-backend-xxx.vercel.app/api`
3. Actions tab → re-run *Deploy frontend to GitHub Pages* workflow
4. Live in ~2 min at https://chitrang313.github.io/Home-Automation/

### Alternative hosts (also free)

The backend code is environment-agnostic — same code works anywhere. Just set the same four env vars (and adjust the route file/output as needed):

| Host | URL | Free tier notes |
|---|---|---|
| **Vercel** ⭐ | `*.vercel.app` | Truly free forever, no CC, fast cold starts |
| **Render** | `*.onrender.com` | Free but service sleeps after 15-min idle (~30s cold start) |
| **Fly.io** | `*.fly.dev` | 3 small VMs free, always-on, requires CC after signup |
| **Firebase Functions** | `*.cloudfunctions.net` | Requires Blaze (pay-as-you-go); free quota is generous but billing must be enabled |

The repo's `firebase.json` + `.firebaserc` are kept so Firebase Functions remains a one-command-away option if you switch later.

### Firmware (manual flash via Arduino IDE)

The `.ino` sketches don't auto-deploy. Open in Arduino IDE 2.x, select your ESP32 board, fill in your Wi-Fi / Firebase credentials, and flash. We're keeping credentials manually-set rather than in version control for security.

## Local Development

See [`website/README.md`](website/README.md) for backend + frontend dev setup.
