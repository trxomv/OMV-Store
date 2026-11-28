# OMV Store data and settings mapping

Last verified against the workbooks in read-only mode: **2026-11-25**. The Apps Script remains the read-only bridge; Main Configuration’s provider registry is the source of provider discovery. Provider spreadsheet references are resolved at runtime from that registry. Spreadsheet IDs, credentials, and competition-entry records are intentionally excluded from this document and from the implementation branch.

## Main Configuration mapping

| Logical resource | Physical worksheet | Relevant headers / behavior |
|---|---|---|
| Provider registry | `Telecom Providers` | `Provider_ID`, `Provider_Name`, `Spreadsheet_ID`, `Enable`, `Sort Order`. Enabled rows determine which provider workbooks the API reads. |
| Provider categories | `Main Categories` | `Sort Order`, `Category ID`, `Category Name`, `Enable`. The `All Routers` category controls the combined router catalog. |
| Page and refresh settings | `Website Settings` | `Settings`, `Value`, `Enable`. Page visibility is taken from `Enable`. The refresh contract combines `Auto Data Refresh` with the two interval rows’ `Enable` flags and positive `Value`s. |
| Public announcements | `Announcements` | `No.`, `Target`, `Value`, `Enable`; only enabled, targeted rows are returned. |
| Payment methods | `Payment Methods` | `Payment Method`, `Enable`; only enabled rows are returned. |
| Contacts | `Social Media` | `Sort Order`, `Contact ID`, `Contact Type`, `Value`, `Target`, `Enable`; only enabled and applicable contacts are returned. |

At the time of verification, the Main Configuration `Website Settings` page enables were Vodafone `TRUE`, WE `FALSE`, Orange `TRUE`, and Etisalat `TRUE`. `Auto Data Refresh` was enabled; the general interval was 15 seconds and the competition-check interval was 5 seconds. Those are recorded observations, not hardcoded defaults.

At the same read-only check, VF, Orange, and Etisalat each had their local page, offer, discount-rate, router, and competition switches enabled. WE had `Show Offers WE`, `Show WE Routers`, `Show to EOM`, `Show to 15`, both custom-rate start switches, and `Show WE Competitions` enabled. WE had no local page or discount-rate setting. These values may change in the source workbook; the code reads them dynamically.

## Provider workbook mappings

All four providers use `Page Settings`-equivalent tabs with headers `Settings`, `Enable`. Each mapped boolean is parsed from the actual `Enable` cell. Missing settings are not guessed as enabled; invalid values fail closed and produce sanitized diagnostics.

| API provider | Provider workbook tabs used | Page Settings keys and mapping |
|---|---|---|
| VF / Vodafone | `Mobile_Rate_Plans`, `@Home_Rate_Plans`, `VF-Routers`, `VF-Routers_Details`, `VF-Page Settings`, `VF-Competitions`, `VF-Terms&Conditions` | `Show Vodafone Page` → provider-local page gate; `Show Vodafone Offers` → offer section; `Show Vodafone Routers` → router section; `Show Discount Rate` → returned as `discountRateEnabled`; `Show Vodafone Competitions` → competition section. |
| TE / WE | `Mobile_Rate_Plans`, `Mobile_Plans_2_EOM`, `Mobile_Plans_2_15`, `TE-Air_Rate_Plans`, `Custom Pricing`, `Add-on`, `TE-Routers`, `TE-Routers_Details`, `TE-Page Settings`, `TE-Competitions`, `TE-Terms&Conditions` | `Show Offers WE` → offer section; `Show WE Routers` → router section; `Show to EOM` and `Show to 15` → the existing EOM/day-15 categories; `Show WE Competitions` → existing WE competition tab; customizer gates use `Custom Rate Plans From 1` and `Custom Rate Plans From 16`. No provider-local `Show WE Page` or `Show Discount Rate` row exists. |
| ORA / Orange | `Mobile_Rate_Plans`, `Home_Wir_Rate_Plans`, `ORA-Routers`, `ORA-Routers_Details`, `ORA-Page Settings`, `ORA-Competitions`, `ORA-Terms&Conditions` | `Show Orange Page` → provider-local page gate; `Show Orange Offers` → offer section; `Show Orange Routers` → router section; `Show Discount Rate` → returned as `discountRateEnabled`; `Show Orange Competitions` → competition section. |
| ET / Etisalat | `Mobile_Rate_Plans`, `eHome_Rate_Plans`, `ET-Routers`, `ET-Routers_Details`, `ET-Page Settings`, `ET-Competitions`, `Etisalat-Terms&Conditions` | `Show Etisalat Page` → provider-local page gate; `Show Etisalat Offers` → offer section; `Show Etisalat Routers` → router section; `Show Discount Rate` → returned as `discountRateEnabled`; `Show Etisalat Competitions` → competition section. |

### Plan and router row schemas

Mobile plans use `Plan_ID`, `Plan-Name`, `MBs`, `Minutes`, `Main Price`, `Increase`, `Final Price`, `Offer Price`, `Show Offer`, `First Badge`, `Second Badge`, and `Show Rate Plan`. Home plans use the same pattern with `GBs` in place of `MBs` and without the mobile-only `Minutes` column. TE EOM/day-15 worksheets use `Plan_ID`, `Plan-Name`, `MBs`, `Minutes`, `Main Price`, `Increase`, `Final Price`, `Tha Actual Days Left`, `Days Left`, and `Show`.

Router sheets use `Router ID`, `Router Name`, `Price`, `Increase`, `FInal Price`, `Discount Price`, `Show Offer`, `First Badge`, `Second Badge`, `Show Router`, and `Sort Order`. `Show Router` controls whether the router record is included. `Show Offer` independently controls whether its discount/offer price is exposed and rendered. The adapter does not treat a generic `Enable` column as a substitute for `Show Router`.

The provider competition tabs have the shared public schema `Competition ID`, `Competition Title`, `Benefit_Type`, `Gift_Data_GB`, `Gift_Duration`, `Duration_Unit`, `Start_Date`, `End_Date`, `Terms`, `Sort_Order`, `Enable`. Only enabled rows with an identifier and title appear in the normalized `sections.competitions` data. The API preserves ascending `Sort_Order`. No competition-entry worksheet or participant registration source is read or returned.

## API and frontend flow

- `resource=site` returns enabled registry providers and each provider’s main/local page state, offer/router/competition switches, and source status. The provider-level `pageEnabled` flag is the conjunction of the Main Configuration page switch and the local provider page switch where such a local switch exists. WE has no local page switch, so its page state follows Main Configuration only.
- `resource=provider&id=<provider>` returns source tables, normalized terms/router/competition sections, and settings diagnostics. Offers remain gated by both page and offer switches. Routers remain gated by page and router switches; each router row is separately gated by `Show Router`, with `Show Offer` independent.
- `discountRateEnabled` is a Boolean derived from the matching provider’s `Page Settings` row and its `Enable` cell. It does not remove or alter discount data, price fields, calculations, offer visibility, or ordering in the API.
- The existing WE normalizer consumes the verified EOM and day-15 worksheets and mapped settings. The API forwards `Show to EOM` and `Show to 15` as the legacy normalizer’s effective category switches. The existing WE competition tab is gated by `Show WE Competitions` and uses only the provider’s public competition table.
- `resource=routers` respects Main Configuration’s `All Routers` category and aggregates only provider records whose page and router section gates are enabled.
- API and frontend polling preserve the configured interval. An explicit `refreshSeconds: 0` (including null/invalid explicit values) schedules no retry timer; a positive interval is used as returned. Fallback intervals are used only when the API omits the field entirely.

## Discount percentage visibility

For VF, ORA, and ET, the provider-page renderer shows the `خصم N%` badge only when `pageSettings.discountRateEnabled === true`. The setting maps to `Show Discount Rate` in that provider’s `Page Settings` worksheet, and the source-of-truth column is `Enable` (not a `Value` field). `false`, a missing row, an invalid checkbox, or a null API value hides only the percentage badge. The original price, discounted/final price, offer data, and offer visibility remain unchanged. `Show Discount Rate` is independent of `Show Offer`, page visibility, and router controls. The existing WE renderer and its discount/offer behavior are preserved; no WE discount-rate setting is added.

## Standalone competitions page

VF, ORA, and ET provider pages link to `/competitions.html?provider=VF`, `/competitions.html?provider=ORA`, and `/competitions.html?provider=ET`, respectively. A link is shown only when the provider ID is supported, the API reports the provider and page enabled, `sections.competitions.enabled` is true, and at least one enabled public competition row has both a non-empty `Competition ID` and `Competition Title`. The standalone page validates the parameter against VF/ORA/ET, loads that provider through the existing `resource=provider&id=<legacy id>` API request, and links back to that provider page.

The frontend uses only the public competition fields `competitionId`, `title`, `benefitType`, `giftDataGb`, `giftDuration`, `durationUnit`, `startDate`, `endDate`, `terms`, and `sortOrder`, copied from the normalized API records into an allowlisted object. It does not render arbitrary row properties or registration actions. API ordering is retained. Loading, disabled, empty, and error states are distinct, and no sample competitions are supplied. Participant names, phone numbers, registrations, private entries, and the competition-entry worksheet remain outside the API and frontend boundary.

Two additional local defenses prevent the provider response's raw `tables.competitions` copy from becoming a privacy bypass: `apps-script/Code.gs` filters that source table to the 11 approved public source columns (`Competition ID`, `Competition Title`, `Benefit_Type`, `Gift_Data_GB`, `Gift_Duration`, `Duration_Unit`, `Start_Date`, `End_Date`, `Terms`, `Sort_Order`, and `Enable`); `public/js/data/multi-provider-client.js` removes the entire raw competition table before returning or caching a provider payload, and sanitizes matching entries already in local storage. The page continues to use the normalized `sections.competitions` data. These source changes are local to this branch: the production Apps Script deployment and its cache have not been changed or cleared, so the server-side column filter is not claimed as active in production until separately deployed by the owner.

WE’s existing competitions experience on `/we.html` is unchanged and is not routed through the standalone VF/ORA/ET page.

## Diagnostics and privacy boundary

The provider API can report `SETTING_MISSING`, `SETTING_INVALID_BOOLEAN`, `SCHEMA_UNSUPPORTED`, `WORKSHEET_MISSING`, and aggregate row-quality codes such as `INVALID_CHECKBOX`, `MISSING_IDENTIFIER`, `INVALID_PRICE`, and `INVALID_QUOTA`. Diagnostics contain logical resource names, worksheet/header names, and aggregate counts only; they do not contain cell values, provider workbook identifiers, or participant details. Diagnostics are safe to log without retaining source records.

The endpoint and frontend remain read-only with respect to Google Sheets. The API’s existing cache behavior is preserved; this change does not clear or mutate production caches. The browser's existing local cache format remains in use, but raw competition tables are stripped on both fresh writes and reads of old entries. No pricing formulas, eligibility rules, offer ordering, customizer calculations, router calculations, contact behavior, or subscriptions are recalculated by the new presentation layer.

## Shared offer and router card presentation

`public/js/components/source-badges.js` renders `First Badge` and `Second Badge` as independent source labels. The first field stays first in source order and is placed at the physical upper-left edge of a card; the second stays second and is placed at the physical lower-left edge in RTL. Empty values, explicit false/disabled states, and disabled-value sentinels are omitted; a lone second badge is never copied into the first position. WE plan normalization preserves both fields and their optional enable flags. Provider plan cards use the legacy `Badge` field only if no split badge value or enable field exists; an explicit blank/disabled first badge or a second badge suppresses legacy fallback.

`public/js/components/router-card.js` is shared by WE, provider pages, and `/routers.html`. The router API's normalized record remains unchanged; where a provider response already includes the public raw `tables.routers` rows, the UI matches a router only by a unique `Router ID` and copies only the two badge values/enable flags into that view-model. Duplicate IDs are treated as ambiguous and are not enriched. The catalog's provider filter accepts either canonical provider IDs or legacy numeric IDs. Its source-table promise cache is shared only within one render/refresh cycle and cleared at the start of every catalog refresh so live badge data is reloaded.

The card displays `discountPrice` only when the normalized `showOffer` value is exactly `true`; router section visibility remains controlled separately by `sections.routers.enabled`. Price amounts are formatted for display only and are never calculated here. Router images use a local image only when that exact local asset exists; at the time this change was recorded, the only available router image was `assets/routers/we/TE_RTR_201.jpg`. The schema carries neither an inventory/out-of-stock field nor a router-order action, so the UI adds neither an invented stock state nor a fabricated purchase link.

The responsive card grid targets one column through 600px, two columns from 601–1100px, three columns from 1101–1359px, and auto-fit columns with a 250px minimum at 1360px and above. With the existing 1180px content shell this yields four cards on wider desktop widths where the card minimum permits; content can wrap instead of being clipped. Offer facts retain quota and minutes side by side when two columns fit.

### Live API and responsive verification (2026-11-28)

Chromium loaded the configured read-only Apps Script endpoint from `public/site-config.js`. Final JSONP responses were HTTP 200 for `resource=provider&id=1..4` and `resource=routers`. The provider payloads reported `sections.offers.enabled=true` and `sections.routers.enabled=true` for WE; VF, ORA, and ET each reported offers disabled and routers enabled. Their standard tables were available with 10 source rows each; normal page rendering correctly kept their offer sections hidden according to the API and showed 2 VF, 1 ORA, and 1 ET router cards. WE rendered 10 packages; the combined router catalog rendered 4 routers. This preserves business settings rather than treating hidden grids as empty or as layout evidence.

For layout-only verification of VF/ORA/ET package cards, an isolated, disposable Chromium context temporarily changed only the returned `sections.offers.enabled` flag to `true`; it preserved the real API rows, values, Page Settings, and all other response fields. This local response override was not written to source, Sheets, Apps Script, caches, or a deployment. It rendered 10 VF, 9 ORA, and 10 ET cards, exercising the shared provider-card presentation using source records only.

At widths 360, 375, 390, 430, 768, 820, 1024, 1280, 1366, 1440, and 1920px, all visible offer/router grids followed the one/two/three/four-column breakpoints. After the final badge/cache fixes, the audit was repeated across all five page types and the isolated provider-offer layout check; no horizontal page overflow, card-to-card overlap, card overflow, or out-of-grid cards were measured. Visible first badges were at the physical top-left and second badges at the physical bottom-left in RTL. The earlier WE page-width issue was traced to the card's blurred decorative pseudo-element positioned beyond its inline edge; the decoration was moved inside the card without clipping card content. Chromium reported no console errors, page errors, failed requests, or HTTP error responses in the completed runs. Final automated suite: 102/102; static build passed; independent JavaScript review approved.
