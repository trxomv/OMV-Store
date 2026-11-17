# OMV Store — Unified Telecom Offers

OMV Store is a static Arabic RTL telecom-offers site that preserves the existing WE experience and adds a multi-provider homepage, provider-page template, and shared router catalog. It is built with vanilla HTML, CSS, and JavaScript ES modules.

## Pages

- `/` — OMV Store homepage with permanent cards for Vodafone, WE, Orange, and Etisalat.
- `/we.html` — preserved WE offers page and calculator; its offer/pricing logic remains in the existing `public/js/data/customizer-core.js`.
- `/provider.html?id=1`, `?id=3`, `?id=4` — shared provider page for Vodafone, Orange, and Etisalat. ID `2` redirects to the existing WE page.
- `/routers.html` — cross-provider router catalog with provider filtering.

## Run locally

Requirements: Node.js 18 or newer. There are no runtime or build dependencies beyond Node.js.

```bash
npm ci
npm test
npm run dev
```

Open `http://localhost:3000`. For a built copy:

```bash
npm run build
npm run preview
```

The static build is written to `dist/`; it validates all four page routes and required local assets. `npm run dev` serves `public/` directly. Do not use `npm run preview` before `npm run build`.

## Data sources and Preview mode

`public/site-config.js` contains the single browser-safe `centralApiEndpoint` configured for the owner-provided Apps Script Web App. Pages request the read-only OMV contract from that endpoint, cache the last valid response, and fall back to the dated `public/data/preview-snapshot.json` if the endpoint is unavailable or still returns the older WE-only response. The snapshot is dated **2026-11-11** and remains explicitly labeled as non-live.

The configured `/exec` endpoint currently responds, but a read-only probe showed the older WE-only response shape; redeploy `apps-script/Code.gs` to that deployment before relying on live OMV resources. Never put spreadsheet IDs, service credentials, or secrets in browser files. See [manual Apps Script setup and API documentation](apps-script/README.md) and the [workbook-to-site map](docs/sheets-map.md). No live Sheet or Apps Script was changed, and this package has not been deployed to production.

The Apps Script API exposes `site`, `provider&id=<stable-id>`, and `routers` resources. It resolves each provider workbook dynamically from `Telecom Providers` in Main Configuration. Only supported/available source fields are returned; missing sheets, disabled settings, incomplete rows, and unavailable sources are not fabricated into offers. IDs are stable: `1=Vodafone`, `2=WE`, `3=Orange`, `4=Etisalat`.

## Project structure

- `public/` — the homepage, WE page, provider template, router catalog, assets, adapters, browser data client, and dated review snapshot.
- `apps-script/Code.gs` — new central read-only Apps Script source; ready to redeploy to the configured `/exec` deployment. `apps-script/legacy/Code.gs` preserves the earlier WE endpoint for reference only and is not used by the new frontend.
- `sheets/` — the two workbook export files supplied with the source package (Main Configuration and WE). Other provider source exports are not included in this directory.
- `docs/` — source mapping, original project references, and the final verification report.
- `tests/` — automated tests for the static pages, adapters, API contract, and build.

## Change and safety boundaries

The central Apps Script is source-only and read-only. The workbook IDs are not exposed to the frontend. WE package calculation formulas have not been edited. No Google Sheets, live Apps Script, GitHub repository, Vercel/Netlify site, or production deployment was modified as part of this handoff.

To make all OMV resources live, follow the manual procedure in `apps-script/README.md`, redeploy `apps-script/Code.gs` to the configured Apps Script deployment, confirm that `resource=site` returns the OMV contract, then run the full local test and build commands. Deployment to website hosting is a separate owner-approved action.
