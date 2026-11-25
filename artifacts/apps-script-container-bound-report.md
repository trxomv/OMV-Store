# OMV Store — Main Configuration Apps Script Preparation

## Direct decision

Yes. The final source can be used from **OMV-Store_Main Configuration → Extensions → Apps Script** as a container-bound project. A separate Google Sheets workbook is not required, and the existing provider workbooks remain separate.

The source does not need a functional code change to become container-bound compatible. It already uses `SpreadsheetApp.openById()` and reads the main workbook ID from the mandatory `OMV_MAIN_CONFIG_ID` Script Property. It does not use `SpreadsheetApp.getActiveSpreadsheet()`. Retaining the explicit property is preferable because the Web App execution context should not depend on whichever spreadsheet happens to be active, and it prevents an accidental read from the wrong workbook.

The original setup README was corrected locally because it described a standalone project, which contradicted the requested architecture. The API source, response structure, mappings, canonical provider IDs, and read-only behavior were preserved.

## Files to copy

Copy the complete contents of these source files into the Apps Script editor attached to the existing main workbook:

1. `apps-script/provider-adapters.gs`
2. `apps-script/Code.gs`

The manifest is `apps-script/appsscript.json`. It should be reviewed through Project Settings → Show `appsscript.json` manifest file in editor. It must not be pasted into a `.gs` file. No manifest modification is needed for the container-bound design.

## Script Properties

The only mandatory property used by the code is:

| Name | Value | Status |
|---|---|---|
| `OMV_MAIN_CONFIG_ID` | ID of the existing `OMV-Store_Main Configuration` workbook | Mandatory |

`OMV_COMPETITION_ENTRIES_ID` is not required: it is only declared in `COMPETITION_ENTRIES_MAPPING_` and is never read by the current code. Adding it would not activate competition integration.

## Permissions

The manifest requests only `https://www.googleapis.com/auth/spreadsheets.readonly`. The authorizing account must be able to read the main configuration workbook and every enabled provider workbook referenced by `Spreadsheet_ID` in `Telecom Providers`. No spreadsheet write permission is requested or used.

## Required workbook structure

The main workbook resources are resolved through these worksheet names: `Telecom Providers`, `Main Categories`, `Router Offers`, `Master_Plans`, `Website Settings`, `Social Media`, `Payment Methods`, `Announcements`, and `OMV-Terms&Conditions`.

The main provider table requires `Provider_ID`, `Spreadsheet_ID`, and `Enable`; `Provider_Name` is used when present. Canonical IDs are `VF`, `TE`, `ORA`, and `ET`. The provider IDs are resolved dynamically, and the provider workbook IDs are never hardcoded or returned publicly.

Provider-specific worksheet names and required fields are defined in `provider-adapters.gs`. The adapter validates provider settings, terms, router, and known plan structures while preserving explicit `not_established` diagnostics for `Router Offers` and `Master_Plans` instead of inventing schemas.

## Competition Entries investigation

Competition mappings exist for provider worksheets and the reserved `Competition Entries` mapping. However, the current `Code.gs` does not call any function that reads `COMPETITION_ENTRIES_MAPPING_`, does not read `OMV_COMPETITION_ENTRIES_ID`, does not open a Competition Entries workbook, and does not return competition rows in any API resource. Therefore the integration is mapped but not implemented. No participant information is exposed, and there is no registration/write path.

The website's competitions category correctly preserves this limitation by showing a source-backed empty state when no rows are present. A future implementation would require an approved read-only data source, response fields, privacy rules, and tests; this task does not add those or modify any workbook.

## Local checks performed

The project checks run against the prepared local source. Apps Script tests execute inside a mocked read-only workbook environment and verify dynamic provider access, canonical IDs, mapping behavior, safe public responses, and absence of write methods. They do not contact Google or deploy the script.

No Google Sheets were edited. No Apps Script authorization, execution, deployment, live project replacement, or `/exec` endpoint change was performed.

## Complete source files

The complete final source is available in the review branch and in the project files:

- `apps-script/Code.gs`
- `apps-script/provider-adapters.gs`
- `apps-script/appsscript.json`
- `apps-script/README.md`
