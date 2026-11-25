# OMV Store production Apps Script API remediation

**Incident date:** 2026-11-25 (UTC+02:00)
**Scope:** Restore the existing Apps Script Web App against the current main and provider workbook architecture without changing its deployment URL or sheet data.

## Confirmed root cause

The active Web App deployment was pinned to Version 1. In that immutable snapshot, `MAIN_ID_PROPERTY_` was incorrectly assigned a workbook-ID-like literal instead of the Script Property key `OMV_MAIN_CONFIG_ID`. The Apps Script project had a non-empty Script Property under the correct key. As a result, the valid-resource path queried Script Properties with the wrong key, and `getMainConfig_()` failed before opening the Main Configuration workbook. `doGet()` caught the exception and returned `source_unavailable`.

Execution history showed completed Version 1 GET runs, but the expanded Cloud Logs reported no available logs. The Version 1 source and the correctly named configured Script Property together confirmed the mismatch without modifying spreadsheet data. The current saved editor source already used `OMV_MAIN_CONFIG_ID`; the active deployment had not yet been updated to it.

## Changes

- `apps-script/Code.gs`: clarified the property-key comment; the runtime key remains `OMV_MAIN_CONFIG_ID`. Existing mappings, adapters, provider IDs, and business logic are unchanged.
- `public/site-config.js`: replaced the stale Apps Script endpoint with the user-supplied existing production `/exec` endpoint.
- `public/js/data/data-core.js`: added support for the live WE table headers `Plan_ID`, `Plan-Name`, and separate `First Badge` / `Second Badge` values so source plans pass the existing normalizer. Pricing and visibility rules were not changed.
- `tests/apps-script.test.mjs`, `tests/build.test.mjs`, and `tests/data-core.test.mjs`: added regressions for the exact Apps Script property key, exact production endpoint, and actual WE source-header mapping.
- `docs/production-api-remediation.md`: this record of the root cause, deployment, tests, frontend validation, and remaining limitations.

## Existing deployment and production API checks

The existing Web App deployment was updated from Version 1 to Version 2. The deployment identity and `/exec` URL were preserved. Its prior execution identity (“Me”) and access setting (“Anyone”) were left unchanged. Production GET checks after the update returned HTTP 200 for each required request. The successful resources returned `ok: true`, `sourceStatus: available`, and live spreadsheet-backed data. No workbook IDs or sheet row contents are included here.

| Request | HTTP | API result | Live data / outcome |
|---|---:|---|---|
| `site` | 200 | `ok: true`, `sourceStatus: available` | 2 categories, 4 providers, 4 contacts, 3 payment methods, 11 announcements, 8 terms |
| `provider&id=VF` | 200 | `ok: true`, `sourceStatus: available` | Standard table has 10 rows; page state is `offers_disabled` |
| `provider&id=TE` | 200 | `ok: true`, `sourceStatus: available` | Standard table has 10 rows; page state is `available`; optional `eom`, `to15`, and `air` tables have `unsupported_schema` and zero rows |
| `provider&id=ORA` | 200 | `ok: true`, `sourceStatus: available` | Standard table has 10 rows; page state is `offers_disabled` |
| `provider&id=ET` | 200 | `ok: true`, `sourceStatus: available` | Standard table has 10 rows; page state is `offers_disabled` |
| `routers` | 200 | `ok: true`, `sourceStatus: available` | 4 router rows; provider substates are available for VF/ORA/ET and empty for TE |
| Unknown resource | 200 | `ok: false`, `errorCode: unknown_resource` | Expected error behavior retained |

The three optional WE tables remain unsupported by the adapter and contain zero returned rows; this is a source-schema limitation, not an API transport failure. The API returns mapped workbook data and does not use fabricated offers.

## Frontend validation

A local preview of the built static site loaded live data from the corrected production endpoint. The homepage rendered all four provider states, four router offers, four announcements, three contact/social links, three payment methods, and five source-backed terms. Vodafone, Orange, and Etisalat pages loaded their source-driven disabled-offer status, terms, contacts, and payments rather than showing invented offer cards. The WE page loaded the canonical `TE` response and rendered 10 source-backed offers after the header mapping fix. The router catalog showed four live records; filtering to WE correctly produced the provider-specific empty state. Loading states were observed before API requests completed.

This validates the built frontend in the local preview, not the public production website. The public hostname referenced by repository documentation, `https://we-product.vercel.app/`, returned Vercel `404 DEPLOYMENT_NOT_FOUND`; its `/site-config.js` also returned HTTP 404. Therefore the actual public website could not be loaded or verified. Do not treat this branch push as a frontend publication.

## Tests and remaining limitations

`npm test` passes all 74 tests. `npm run build` succeeds and writes the static site to `dist/`.

The public site remains inaccessible at the documented hostname; its correct live URL needs confirmation and deployment recovery before public frontend verification. The optional WE `eom`, `to15`, and `air` tables remain `unsupported_schema`. Neither limitation was hidden, and neither prompted spreadsheet changes.

## Privacy and architecture

The main and provider workbooks remain separate. No spreadsheet contents, workbook IDs, participant data, account identity, secrets, or credentials are included here. No sheet data, worksheet names, or protected business rules were changed.
