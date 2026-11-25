# OMV Store Phase 03.1 — Verification & Hardening

## Scope

This corrective phase only hardened the existing Phase 03 implementation. All changes remained local and uncommitted. No Google Sheet, Apps Script deployment, production endpoint, hosting configuration, website configuration, or GitHub branch was changed.

## Corrections

### Main Terms

`getMainConfig_()` now resolves Main Terms through the centralized `siteTerms` mapping, which resolves to `OMV-Terms&Conditions`. `Terms&Conditions` remains only as a compatibility fallback. The real mocked API path confirms that the approved sheet is requested and that `Term_Titel` is preserved for main terms.

### Home plans

`buildProviderResource_()` now requests the logical `home` resource. The request is routed through `readMappedTable_()` and the centralized provider adapters:

- VF → `@Home_Rate_Plans`
- TE → `TE-Air_Rate_Plans`
- ORA → `Home_Wir_Rate_Plans`
- ET → `eHome_Rate_Plans`

Missing optional home worksheets remain structured `MISSING_WORKSHEET` results rather than fabricated successful data.

### Main Configuration resources

`getMainConfig_()` now loads `Router Offers` and `Master_Plans` through `readMappedMainTable_()` and the centralized main-resource mapping. The existing v1 response fields remain intact; site output includes summarized states for these newly loaded resources.

### Shared validation and mapped reads

Provider loading now routes through `readMappedTable_()`. Main workbook loading routes through `readMappedMainTable_()`. Required schema validation is applied to mapped resources where the existing schemas are known, while optional fields such as `Term_Titel`, `Show Offer`, and `Show Router` remain optional. Missing required headers and duplicate normalized headers produce `UNSUPPORTED_SCHEMA` diagnostics.

### Provider summaries

Provider summaries now include canonical string `providerId` and `canonicalProviderId` fields while retaining legacy numeric `id` fields. The v1 API therefore remains compatible with existing numeric route consumers.

### Refresh verification

The existing configuration reader independently handles the global switch, competition interval, and general interval. It supports the approved plural competition setting and the singular compatibility alias, prefers the plural alias, preserves per-setting Enable states, and reports conflicting alias values. No Phase 05 polling or synchronization behavior was added.

### Competition and WE safety

Egyptian phone normalization remains isolated and is not connected to a public submission endpoint. No competition writes, `doPost`, LockService submission workflow, or Competition Entries mutation was added. `customizer-core.js`, `data-core.js`, and `we-integration.js` were not modified.

## Test evidence

Commands executed:

```bash
npm test
npm run build
 git diff --check
```

Final test result:

- 62 tests executed
- 62 passed
- 0 failed

The test suite covers real mocked execution paths for approved Main Terms, Router Offers, Master_Plans, all four home-plan mappings, mapped-table diagnostics, provider canonical/legacy IDs, refresh settings, missing optional worksheets, and existing v1 compatibility.

`git diff --check` passed.

## Build limitation

`npm run build` was executed and failed with:

```text
ENOENT: no such file or directory,
open 'public/assets/images/sim-hero.webp'
```

The asset is not present under another filename and has no entry in the available Git history. The reference remains in `index.html`, `we.html`, and `scripts/build.mjs`. No fake replacement was created, the reference was not removed, and the build system was not bypassed.
