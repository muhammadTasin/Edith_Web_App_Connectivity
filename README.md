# Edith Web App Connectivity

Bangla-first web dashboard and API for Project EDEN / Mather Kotha (মাঠের কথা). This repository contains the website, its Node API, and the shared crop-planning and narration packages. The Android source remains in the original NASA project repository under apps/farmer-mobile.

## What we built

- Responsive Bangla-first farmer portal and Krishi officer (SAAO) dashboard, with farmer and officer sign-in flows for the prototype.
- Farmer views for today's crop advice, weather, river erosion, AI assistance, and farm profile.
- Officer overview, ward hydrology map, satellite metrics, farmer follow-up queue, and field observations.
- Interactive crop rotation planner backed by the deterministic, 25-season rotation engine.
- Shared HTTP API for the web dashboard and other clients, including weather, erosion, advice, authentication, AI, officer desk, and data-release routes.
- Dashboard fixes for the 9-ward map text, satellite metric cards, and initial/offline data rendering.

The dashboard and API run together: the API serves the website and handles its data requests.

## Weather location selector

The website's Weather tab lets a user choose from Bangladesh's 64 districts and 500 upazilas, including the five newly approved upazilas reported by BSS in May 2026. The choice is saved in the browser and drives a seven-day forecast request to `/api/v1/weather/forecast`; the API gets model forecast data from [Open-Meteo](https://open-meteo.com/) and caches it for 15 minutes. Forecasts are numerical model estimates, not local station observations.

The location list starts from [Open Admin Data Bangladesh](https://github.com/open-admin-data/bangladesh-administrative-divisions) (CC BY 4.0); district/upazila names are checked against the [Bangladesh National Portal](https://bangladesh.gov.bd/views/upazila-list/). It includes the five recently approved upazilas reported by [BSS](https://www.bssnews.net/news-flash/385117). The portal page currently reports 499 upazilas while BSS reports five new approvals on top of the 495-entry base list, so the selector includes 500 entries, including Matamuhuri. Coordinates are approximate administrative-area reference points, not a selected farm's GPS position; the five additions use representative points.

## Run locally

Requirements: Node.js 22.6 or newer.

~~~bash
npm install
npm start
~~~

Open http://localhost:4000. Run the existing API and crop-engine checks with:

~~~bash
npm test
~~~

## Connect the Android app

The Android app does not connect to this GitHub repository or load the website page. It connects to the API started from this repository. Its screens remain native Android screens, while the web and Android clients share API data and workflows.

The Android client is in the original project repository under apps/farmer-mobile. Its EdenApiClient already calls API routes for advice, weather, river erosion, sign-in/session, and AI. The website uses the same API on the same origin.

### Local development

1. In this repository, start the API and website with npm start.
2. Open the Android project from the original repository in Android Studio and run the app.
3. Choose the connection address for the device:

- Android emulator: http://10.0.2.2:4000
- Physical Android device over USB: run adb reverse tcp:4000 tcp:4000, then use http://127.0.0.1:4000
- Physical device on the same Wi-Fi: use <code>http://YOUR_COMPUTER_LAN_IP:4000</code>, replacing the placeholder with the computer's address on that Wi-Fi network.

The current Android client tries 127.0.0.1, a sample LAN address (192.168.0.244), and the emulator address (10.0.2.2). For another Wi-Fi address, update the candidate URL in EdenApiClient.kt. Its constructor also accepts a baseUrl; EdenFarmerApp.kt currently creates it without an override.

The Android manifest already grants Internet access and allows cleartext HTTP for local development. The server must be running on the same computer, and the phone and computer must be able to reach each other. Do not use localhost from a physical phone without adb reverse: localhost would point to the phone itself.

You can confirm the API is reachable from the development computer at http://localhost:4000/api/v1/overview. The Android client then sends its requests to the same host with paths such as /api/v1/advice, /api/v1/weather, /api/v1/erosion, and /api/v1/ai/ask.

### Deployed connection

Deploy the API from this repository to a reachable server, then configure the Android EdenApiClient with that server's HTTPS base URL. The web app uses relative /api/v1/... paths, so when the API serves the web app, no separate web API URL is needed.

The current authentication, sample farmers, and officer data are prototype/demo implementations. Farmer profile edits and advice history remain in the Android Room database; those records do not sync to the server yet. Production deployment needs a real authentication setup, HTTPS, and server-side persistence for data that should sync between devices.

## Demo sign-in

Prototype values for local demonstration:

- Farmer: 01711-002233, OTP 1234
- SAAO officer: ID saao_talanda_01, access code talanda-demo

## Repository layout

- apps/saao-dashboard/public/ — website interface
- services/api/src/ — HTTP API and static site server
- packages/contracts/ — shared types and API contracts
- packages/rotation-engine/ — deterministic crop rotation engine and data
- packages/narration-core/ — Bangla narration and output validation
- test_pipeline.ts and test_server.js — existing local checks

## Android source repository

[Project EDEN / NASA Space Apps repository](https://github.com/muhammadTasin/project-eden-earth-data-environment-navigator)
