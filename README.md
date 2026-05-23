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

### Backend (manual, recommended: Render or Railway)

GitHub Pages cannot run Node.js, so the Express backend needs a separate host. Recommended free options:

- **Render** (https://render.com): Free web service, auto-deploys on git push, easy env-var management
- **Railway** (https://railway.app): Free tier with 500 hours/month, very fast setup
- **Fly.io** (https://fly.io): Free tier with 3 small VMs

Whichever you pick, the backend needs:
1. `website/backend/firebase-service-account.json` uploaded as a secret file
2. Environment variables from `website/backend/.env.example`
3. Public HTTPS URL (e.g. `https://home-automation-backend.onrender.com`)
4. Update `VITE_API_URL` GitHub Secret to that URL, then re-run the deploy workflow

### Firmware (manual flash via Arduino IDE)

The `.ino` sketches don't auto-deploy. Open in Arduino IDE 2.x, select your ESP32 board, fill in your Wi-Fi / Firebase credentials, and flash. We're keeping credentials manually-set rather than in version control for security.

## Local Development

See [`website/README.md`](website/README.md) for backend + frontend dev setup.
