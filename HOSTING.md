# Local development, build, and preview

The project is a static site with four pages. The new Apps Script endpoint is not deployed, and `public/site-config.js` intentionally leaves `centralApiEndpoint` empty. Therefore local and managed Preview use the dated snapshot at `public/data/preview-snapshot.json`; this is not live data and does not refresh from Google Sheets.

```bash
npm ci
npm test
npm run dev
```

Open `http://localhost:3000`. The server serves `public/`, including `/`, `/we.html`, `/provider.html?id=1`, `/provider.html?id=3`, `/provider.html?id=4`, and `/routers.html`.

For an independently built local copy:

```bash
npm run build
npm run preview
```

The build copies `public/` to `dist/`, validates the page route manifest and required assets, and rejects spreadsheet-ID fields or links in browser-facing HTML/CSS/JS/JSON. The existing Vercel/Netlify config files are preserved; this task does not deploy to either service.

To connect the central API later, the owner must deploy the new source manually following `apps-script/README.md`, then set only the resulting public `/exec` URL in `public/site-config.js`. Do not set a provider workbook ID or secret in browser files. Keep any live API deployment and website deployment as separate, reviewed owner actions.

No live Sheets or Apps Script were edited; no production deployment was made.
