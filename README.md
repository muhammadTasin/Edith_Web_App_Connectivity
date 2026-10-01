# Edith Web App Connectivity

Bangla-first Project EDEN / Mather Kotha web dashboard and its API. The Android client is kept in its own repository; both clients can use this API.

## Run locally

Requirements: Node.js 22.6 or newer.

1. Install dependencies with npm install.
2. Start the dashboard and API with npm start.
3. Open http://localhost:4000.

Run the existing API and crop-engine checks with npm test.

## Demo sign-in

These prototype credentials are for local demonstration only:

- Farmer: 01711-002233, OTP 1234
- SAAO officer: saao_talanda_01, access code talanda-demo

## Repository layout

- apps/saao-dashboard/public/ — dashboard interface
- services/api/src/ — HTTP API and static site server
- packages/ — shared contracts, deterministic crop rotation engine, and narration logic

The API serves the dashboard and exposes the same data and workflows for other clients.
