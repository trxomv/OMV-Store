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
| TE / WE | `Mobile_Rate_Plans`, `Mobile_Plans_2_EOM`, `Mobile_Plans_2_15`, `TE-Air_Rate_Plans`, `Custom Pricing`, `Add-on`, `TE-Routers`, `TE-Routers_Details`, `TE-Page Settings`, `TE-Competitions`, `TE-Terms&Conditions` | `Show Offers WE` → offer section; `Show WE Routers` → router section; `Show to EOM` and `Show to 15` → the existing EOM/day-15 categories; `Show WE Competitions` → existing WE competition tab; customizer gates use `Custom Rate Plans From 1` and `Custom Rate Plans From 16`. No provider-local `Show WE Page` or `Show Discount Rate` row exists. The Main Configuration WE page gate remains authoritative. |
| ORA / Orange | `Mobile_Rate_Plans`, `Home_Wir_Rate_Plans`, `ORA-Routers`, `ORA-Routers_Details`, `ORA-Page Settings`, `ORA-Competitions`, `ORA-Terms&Conditions` | `Show Orange Page` → provider-local page gate; `Show Orange Offers` → offer section; `Show Orange Routers` → router section; `Show Discount Rate` → returned as `discountRateEnabled`; `Show Orange Competitions` → competition section. |
| ET / Etisalat | `Mobile_Rate_Plans`, `eHome_Rate_Plans`, `ET-Routers`, `ET-Routers_Details`, `ET-Page Settings`, `ET-Competitions`, `Etisalat-Terms&Conditions` | `Show Etisalat Page` → provider-local page gate; `Show Etisalat Offers` → offer section; `Show Etisalat Routers` → router section; `Show Discount Rate` → returned as `discountRateEnabled`; `Show Etisalat Competitions` → competition section. |

### Plan and router row schemas

Mobile plans use `Plan_ID`, `Plan-Name`, `MBs`, `Minutes`, `Main Price`, `Increase`, `Final Price`, `Offer Price`, `Show Offer`, `First Badge`, `Second Badge`, and `Show Rate Plan`. Home plans use the same pattern with `GBs` in place of `MBs` and without the mobile-only `Minutes` column. TE EOM/day-15 worksheets use `Plan_ID`, `Plan-Name`, `MBs`, `Minutes`, `Main Price`, `Increase`, `Final Price`, `Tha Actual Days Left`, `Days Left`, and `Show`.

Router sheets use `Router ID`, `Router Name`, `Price`, `Increase`, `FInal Price`, `Discount Price`, `Show Offer`, `First Badge`, `Second Badge`, `Show Router`, and `Sort Order`. `Show Router` controls whether the router record is included. `Show Offer` independently controls whether its discount/offer price is exposed and rendered. The adapter does not treat a generic `Enable` column as a substitute for `Show Router`.

The provider competition tabs have the shared public schema `Competition ID`, `Competition Title`, `Benefit_Type`, `Gift_Data_GB`, `Gift_Duration`, `Duration_Unit`, `Start_Date`, `End_Date`, `Terms`, `Sort_Order`, `Enable`. Only enabled rows with an identifier and title appear in the normalized `sections.competitions` data. No competition-entry worksheet or participant registration source is read or returned.

## API and frontend flow

- `resource=site` returns enabled registry providers and each provider’s main/local page state, offer/router/competition switches, and source status. The provider-level `pageEnabled` flag is the conjunction of the Main Configuration page switch and the local provider page switch where such a local switch exists. WE has no local page switch, so its page state follows Main Configuration only.
- `resource=provider&id=<provider>` returns the source tables, normalized terms/router/competition sections, and settings diagnostics. Offers remain gated by both page and offer switches. Routers remain gated by page and router switches; each router row is separately gated by `Show Router`, with `Show Offer` independent. `discountRateEnabled` is exposed without changing prices or inventing discount presentation behavior.
- The existing WE normalizer consumes the verified EOM and day-15 worksheets and mapped settings. The API forwards `Show to EOM` and `Show to 15` as the legacy normalizer’s effective category switches. The existing WE competition tab is gated by `Show WE Competitions` and uses only the provider’s public competition table.
- `resource=routers` respects Main Configuration’s `All Routers` category and aggregates only provider records whose page and router section gates are enabled.
- API and frontend polling preserve the configured interval. An explicit `refreshSeconds: 0` (including null/invalid explicit values) schedules no retry timer; a positive interval is used as returned. Fallback intervals are used only when the API omits the field entirely.

## Diagnostics and privacy boundary

The provider API can report `SETTING_MISSING`, `SETTING_INVALID_BOOLEAN`, `SCHEMA_UNSUPPORTED`, `WORKSHEET_MISSING`, and aggregate row-quality codes such as `INVALID_CHECKBOX`, `MISSING_IDENTIFIER`, `INVALID_PRICE`, and `INVALID_QUOTA`. Diagnostics contain logical resource names, worksheet/header names, and aggregate counts only; they do not contain cell values, provider workbook identifiers, or participant details. Diagnostics are safe to log without retaining source records.

The endpoint and frontend remain read-only with respect to Google Sheets. The API’s existing cache behavior is preserved; this change does not clear or mutate production caches. No pricing formulas, eligibility rules, offer ordering, customizer calculations, router calculations, contact behavior, or subscriptions are recalculated by the new mapping layer.

## Deferred behavior requiring clarification

`Show Discount Rate` is present for VF, Orange, and Etisalat and is returned as `pageSettings.discountRateEnabled`; WE has no such setting. The existing code does not establish whether it should hide only the displayed percentage badge, hide all discount information, or affect price presentation. No frontend behavior is changed for this control until that scope is confirmed.

Provider competition data is now available through the API for all four providers, and the existing WE competition destination can consume its established public table. The provider-page templates for VF, Orange, and Etisalat have no established competition section or link destination. No new competition UI was added for those pages; confirm the intended placement and interaction before implementing it. Competition-entry/participant records remain outside scope.
