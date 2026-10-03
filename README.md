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

## Weather and location

The Weather tab (website) and Weather screen (Android) both read the same list of 64 districts and 500 upazilas from `GET /api/v1/locations`, and both can use the device's current location when permission is granted. The selected location's own coordinates are sent to the API; nothing defaults to a fixed farm. The choice is stored on the device.

- **Forecast** (`/api/v1/weather/forecast`): [Open-Meteo](https://open-meteo.com/) numerical weather-model estimate, cached 15 minutes per exact location. Includes hourly humidity, which the hourly THI uses.
- **NASA POWER** (`/api/v1/weather`): delayed (about 2–3 days) satellite/reanalysis observations, shown separately and never labelled live. SMAP soil moisture is not in this payload.
- If a provider fails the API answers `provider_unavailable`; it never substitutes stored values.

Location list: [Open Admin Data Bangladesh](https://github.com/open-admin-data/bangladesh-administrative-divisions) (CC BY 4.0), names checked against the [Bangladesh National Portal](https://bangladesh.gov.bd/views/upazila-list/), plus the five upazilas reported by [BSS](https://www.bssnews.net/news-flash/385117) (500 entries). Coordinates are approximate administrative reference points, not farm positions.

## Run, test and connect clients

See **[docs/SETUP.md](docs/SETUP.md)** for exact commands (API, website, Android emulator/device) and the credentials that are still required, **[docs/api-contract.md](docs/api-contract.md)** for the routes and schemas both clients use, and `.env.example` for configuration. Quick start (Node.js 22.6+):

~~~bash
npm install
npm start     # http://localhost:4000
npm test
~~~

The Android app (separate repository, `apps/farmer-mobile`) is a client of this API only: configure its base URL per build (`eden.baseUrl.debug` / `eden.baseUrl.release`), see the setup guide. Do not add a second backend there.

## What is real and what is not

| Area | State |
|---|---|
| Open-Meteo forecast, NASA POWER observations | Real provider calls; errors are explicit |
| Earth Engine (NDVI, SMAP, IMERG) | Worker implemented (`services/api/src/cattle_worker.py`) but **not verified against a live Earth Engine account**; reports `configuration_required` until `earthengine-api`, a project and credentials exist |
| Cattle jobs | In-process queue + local JSON file: not production-durable; restart marks unfinished jobs failed (retryable) |
| THI advisory | NRC (1971) formula on forecast temperature and humidity + generic guidance. No milk-loss, disease or water-volume prediction |
| Trained cattle-risk model | Does not exist (no labelled data). Reported as `training_data_unavailable` |
| LLM (Gemma 3 4B or other) | Optional adapter only (`LLM_*`). No model is bundled, trained or fine-tuned here |
| Text-to-speech | Optional separate adapter (`TTS_*`); otherwise clients use on-device speech and say so |
| Rotation planner, officer desk, `/overview` | Talanda (Tanore) pilot data only |
| Sign-in | Demo accounts, not production authentication |

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
- test_pipeline.ts, test_cattle.ts and test_server.js — local checks (`npm test`)
- docs/ — API contract, setup guide, cattle architecture proposal

## Cattle AOI and ML architecture

The proposed cattle-only, farm-AOI data pipeline and model-readiness constraints are documented in [docs/cattle-aoi-ml-architecture.md](docs/cattle-aoi-ml-architecture.md). The document describes the target design; see "What is real and what is not" above for what is implemented.

## Android source repository

[Project EDEN / NASA Space Apps repository](https://github.com/muhammadTasin/project-eden-earth-data-environment-navigator)
