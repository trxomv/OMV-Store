# Central OMV Store Apps Script API — Container-Bound Main Configuration

This folder contains the source for one read-only Apps Script Web App whose project should be opened from the existing **OMV-Store_Main Configuration → Extensions → Apps Script** workbook. The main workbook remains the central configuration source. Provider workbooks remain separate and are opened dynamically through their existing `Spreadsheet_ID` values. The maintained workbook/settings map is [docs/data-settings-mapping.md](../docs/data-settings-mapping.md). This source has not been authorized, run in Google Apps Script, deployed, or connected to a live workbook by this task.

## Architecture decision

The preferred and supported setup is a container-bound Apps Script project attached directly to the existing `OMV-Store_Main Configuration` workbook. No new Google Sheets workbook is required, and no standalone Apps Script project is required. The code deliberately uses `SpreadsheetApp.openById()` with the mandatory `OMV_MAIN_CONFIG_ID` Script Property rather than `SpreadsheetApp.getActiveSpreadsheet()`. This is more reliable for a Web App execution, prevents accidental reads from a different active workbook, and keeps the main workbook identity explicit.

When the project is opened through Extensions → Apps Script, set `OMV_MAIN_CONFIG_ID` to the ID of that same bound workbook. The active container is not used as an implicit data source. The property remains mandatory for reliable Web App execution and for local/static tests that mock the Apps Script services.

## Source files to place in the Apps Script editor

Add these two source files to the container-bound project:

1. `provider-adapters.gs`
2. `Code.gs`

The order is not functionally significant, but adding `provider-adapters.gs` first makes the registry and mappings visible before reviewing `Code.gs`. The two files are the complete required source for the current API.

The manifest is `appsscript.json`. In the Apps Script editor, enable **Project Settings → Show `appsscript.json` manifest file in editor**, then review or copy the manifest from this folder. Do not paste JSON into a `.gs` file. No manifest change is required for the container-bound architecture: it already uses V8, Cairo timezone, the read-only Sheets scope, and the existing Web App settings. This task does not authorize or deploy it.

## Script Properties

Only one property is required by the actual code:

| Property | Required | Value | Use |
|---|---:|---|---|
| `OMV_MAIN_CONFIG_ID` | Yes | The ID of the existing `OMV-Store_Main Configuration` workbook | Passed to `SpreadsheetApp.openById()` for all main configuration reads |

`OMV_COMPETITION_ENTRIES_ID` is **not required** by the current implementation. It appears in `COMPETITION_ENTRIES_MAPPING_` as a reserved mapping declaration, but no function reads that property or opens a Competition Entries workbook. Do not add it merely because the mapping exists.

Do not place spreadsheet IDs, tokens, or credentials in source code, browser code, HTML, or public configuration files.

## Main workbook structure

The code resolves these logical resources from the main workbook through `provider-adapters.gs`:

| Logical resource | Worksheet |
|---|---|
| Providers | `Telecom Providers` |
| Categories | `Main Categories` |
| Router offers | `Router Offers` |
| Master plans | `Master_Plans` |
| Website settings | `Website Settings` |
| Social/contact rows | `Social Media` |
| Payment methods | `Payment Methods` |
| Announcements | `Announcements` |
| Main terms | `OMV-Terms&Conditions` |

The required headers enforced by the current adapter layer include:

- `Telecom Providers`: `Provider_ID`, `Spreadsheet_ID`, `Enable`; `Provider_Name` is used when available.
- `Main Categories`: `Category ID`, `Enable`; `Category Name` is supported for category matching.
- `Website Settings` and provider page-settings sheets: `Settings`, `Enable`; `Value` is used for configured values and refresh settings.
- Provider terms: `Term_ID`, `Term_Text`, `Term_Type`, `Enable`, `Display_Order`.
- Router sheets: `Router ID`, `Router Name`, `FInal Price`, and `Show Router` for all four providers. `Show Offer` independently controls the router discount offer.
- `Router Offers` and `Master_Plans` remain explicitly schema-unestablished in the source; the code preserves their rows and reports schema diagnostics rather than inventing required headers.

Optional/recognized columns include provider name aliases, `Target`, announcement/payment/contact fields, plan pricing and visibility fields, router pricing/display fields, terms title fields for main terms, and the refresh aliases documented in `provider-adapters.gs`.

## Provider resolution and access

The `Telecom Providers` rows are read from the main workbook. Canonical provider IDs are:

- `VF` → Vodafone
- `TE` → WE
- `ORA` → Orange
- `ET` → Etisalat

The code reads each row's `Spreadsheet_ID` dynamically and opens the corresponding provider workbook with `SpreadsheetApp.openById()`. Provider spreadsheet IDs are not hardcoded and are removed from public response objects. Numeric IDs `1`–`4` remain only as an explicit legacy route compatibility boundary.

Provider worksheet mappings, including provider-specific package, router, page-settings, and terms sheets, are defined only in `provider-adapters.gs`.

## API behavior

`Code.gs` exposes read-only `doGet(event)` resources:

- `resource=site`: public website settings, provider summaries, active announcements, contacts, payment methods, main terms, and mapped main tables.
- `resource=provider&id=VF|TE|ORA|ET` (legacy numeric IDs remain compatible): one provider's normalized data, mapped page settings, offers, routers, terms, public competition rows, sanitized diagnostics, targeted site content, and the WE compatibility payload for `TE`.
- `resource=routers`: the enabled all-routers catalog and provider states.

The response contract retains the existing v1 envelope (`ok`, `apiVersion`, `resource`, `sourceStatus`, `generatedAt`) and adds provider setting-state, competition-section, and sanitized diagnostics fields. Validated JSONP callbacks remain supported. There is no `doPost` and no spreadsheet write operation.

## Competitions and participant-data boundary

The four provider workbooks have public-data competition tabs (`VF-Competitions`, `TE-Competitions`, `ORA-Competitions`, `ET-Competitions`) with a shared schema. The API now reads those provider tabs and applies each provider's `Show <Provider> Competitions` setting (WE: `Show WE Competitions`). WE's pre-existing competition view consumes the normalized rows; no new competition UI destination was introduced on Vodafone, Orange, or Etisalat pages because none is established in the current frontend.

`provider-adapters.gs` also retains the reserved declaration:

```text
resource: competitionEntries
spreadsheetProperty: OMV_COMPETITION_ENTRIES_ID
worksheet: Competition Entries
```

The actual `Code.gs` source does not consume `COMPETITION_ENTRIES_MAPPING_`, read `OMV_COMPETITION_ENTRIES_ID`, open a Competition Entries workbook, or access participant registrations. No participant data is returned, and no registration write or spreadsheet write exists. Any future participant-data integration requires an approved read-only source, explicit privacy rules, API contract, and tests.

## OAuth and account access

The manifest requests only:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

The Google account that authorizes or eventually deploys the project must have read access to the main configuration workbook and to every enabled provider workbook named by its `Spreadsheet_ID` rows. No write scope, Drive scope, external service, Firebase, or Supabase permission is required by the current source.

This task intentionally did not authorize, execute, deploy, or replace any live Apps Script project or `/exec` endpoint. The existing production endpoint remains unchanged.

## Local verification

From the project root:

```bash
npm test
npm run build
```

The Apps Script tests execute the source inside mocked, read-only workbooks. They verify the actual provider-specific tabs and setting keys for all four providers, router visibility versus router offers, WE EOM/day-15 controls, competition public-table mapping, diagnostics, response safety, refresh behavior, and the absence of write methods. They do not contact Google and cannot verify a live deployment without authorization. No Google Sheets were edited by this task.
