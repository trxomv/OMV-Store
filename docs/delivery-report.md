# OMV Store integration — delivery report

**Date:** 2026-11-12  
**Scope:** Local source integration and review package only. No live Google Sheet, Apps Script deployment, GitHub repository, or production website was changed.

## Delivered in the source tree

- Arabic RTL, Dark Mode homepage with persistent cards for Vodafone, WE, Orange, and Etisalat and source-driven status/announcements/contact/payment information.
- Shared provider page for Vodafone, Orange, and Etisalat, with provider-specific visibility, offer, router, and terms states. WE keeps its existing `/we.html` page.
- Standalone `/routers.html` catalog and per-provider router sections using the same normalized data records. The snapshot contains no valid enabled router products, so the pages correctly show empty states rather than invented inventory.
- One new, central, read-only Apps Script source at `apps-script/Code.gs`, which reads the main workbook ID from Script Properties and resolves provider workbook IDs from the Main Configuration provider registry. Manual deployment instructions and API examples are in `apps-script/README.md`.
- Central browser data client, schema adapters, safe stale/cache fallback, non-live dated review snapshot, synchronized route manifest, local development server and static build updates.
- WE common-section integration for routers and terms. `public/js/data/customizer-core.js` was not edited in this integration work; the existing pricing tests remain in the full suite.

## Verification performed

- `npm ci --ignore-scripts` — completed successfully from the synchronized package lock.
- `npm test` — **52 passed, 0 failed**.
- `npm run build` — succeeded and produced `dist/` in snapshot mode.
- JavaScript syntax checks — browser/server JS checked with Node; central Apps Script source parsed through the existing VM test harness and `node --check` via standard input.
- Local HTTP checks — `/`, `/we.html`, `/provider.html?id=1`, `?id=3`, `?id=4`, `/routers.html`, `/manus-routes.json`, and `/data/preview-snapshot.json` each returned HTTP 200. The test suite parses the route manifest as JSON.
- Visual review in headless Chromium at desktop and mobile sizes covered the homepage, WE page, provider page, and routers catalog. The rendered dark theme, Arabic RTL alignment, provider status cards, and empty states were visible at 1440px desktop and 390px mobile widths. No horizontal clipping was apparent in the inspected viewports. Captured Chromium logs had no matching uncaught-error or failed-resource entries.
- A browser-source scan found no Google spreadsheet URLs, workbook IDs, `Spreadsheet_ID`, or `spreadsheetId` fields in `public/`.

These checks validate the local project, snapshot behavior, and Apps Script contract under mocks. They do **not** validate a live Apps Script deployment or live workbook data.

## Data and integration limitations

- `public/site-config.js` points to the owner-provided Apps Script `/exec` endpoint. The browser accepts only the OMV resource contract (`site`, `provider`, or `routers`); if the deployment is unavailable or still returns the older WE-only shape, it uses cached data or the fixed **2026-11-11** snapshot and shows the appropriate source status.
- The supplied `sheets/` directory contains only the Main Configuration and WE workbook exports. Vodafone, Orange, and Etisalat workbook export files are not included there. The central API sheet mapping and the dated snapshot support the multi-provider interface, but future changes in those workbooks require a new review/export or a manually deployed central endpoint.
- In the reviewed snapshot, provider/page settings disable some offer sections, Orange and Etisalat are disabled in the provider registry, and no valid enabled router records are available. The interface reflects those states; it does not create sample prices, router products, or legal text. Main-workbook general terms are not populated in the reviewed data.
- The configured endpoint was probed read-only and is reachable, but it still returns the older WE-only response shape. The new `apps-script/Code.gs` is ready; redeploy it to the same `/exec` deployment and confirm `resource=site` before treating all OMV resources as live.

## Remaining actions outside this handoff

The owner may review the ZIP and Preview, redeploy the central Apps Script to the configured `/exec` URL, and separately decide whether to publish the website. No website production publication was performed here.
