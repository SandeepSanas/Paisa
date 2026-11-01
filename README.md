# Paisa

Live market scanner with signals, charts, options OI, a Reversal Lab, risk manager, price alerts,
and a News tab (headlines, US data releases, event calendar, macro risk, NSE filings, big-move alerts).
Sign-in and per-user cloud sync use Firebase; the app is hosted on GitHub Pages and installs as an app (PWA).

## App files (this GitHub repository)
- `index.html` – the app
- `auth.js` – sign-in, cloud sync, server feeds, push notifications, app updates (contains the public Firebase web config)
- `sw.js`, `manifest.webmanifest`, icons – installable-app files and notification display
- `firestore.rules` – security rules (also deployed with the server)

## Server (Firebase Cloud Functions, deployed from Cloud Shell, not GitHub)
`paisa-server.zip` holds `firebase.json`, `.firebaserc`, `firestore.rules` and `functions/`.
One scheduled function (`tick`, every minute, Mumbai region) collects news RSS, NSE announcements,
BLS / EIA / FRED data, the event calendar, and 1-minute prices for big-move detection, writes them to
Firestore `feed/*`, and sends push notifications. API keys live in Secret Manager:
`FRED_KEY`, `BLS_KEY`, `EIA_KEY`, `VAPID_PUBLIC` (the Web Push public key from Firebase → Cloud Messaging).

Deploy: `cd functions && npm install && cd .. && firebase deploy --only functions,firestore:rules`

## Updating the app
Replace the changed files in this repository. Open apps show "A new version of Paisa is ready → Update".
When publishing a new version, also change `VERSION` at the top of `sw.js` (for example `paisa-v4`).

Educational tool, not investment advice.
