# Paisa

Live market scanner with signals, charts, options OI, a Reversal Lab, risk manager and price alerts.
Sign-in and per-user cloud sync use Firebase; the app is hosted on GitHub Pages and installs as an app (PWA).

## Files
- `index.html` – the app
- `auth.js` – sign-in, cloud sync, app updates (contains the Firebase web config)
- `sw.js`, `manifest.webmanifest`, `icons/` – installable-app files
- `firestore.rules` – security rules to paste into Firebase

## Updating
Replace the changed files in this repository. Open apps show "A new version of Paisa is ready → Update".
When publishing a new version, also change `VERSION` at the top of `sw.js` (for example `paisa-v2`).

Educational tool, not investment advice.
