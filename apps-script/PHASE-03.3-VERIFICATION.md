# OMV Store Phase 03.3 — Final Hardening & Independent Test Delivery

## Status

**PARTIALLY COMPLETED**. The two verified Apps Script contract issues are corrected and the complete available implementation/test delivery has been packaged locally. The website production build remains blocked by the previously identified missing `public/assets/images/sim-hero.webp` asset.

## Competition refresh alias precedence

`readRefreshConfiguration_()` now selects the plural row object first, then reads both `Value` and `Enable` from that same selected row. This is independent of worksheet row ordering.

Plural preferred name:

```text
Competitions Change Check (Seconds)
```

Singular legacy alias:

```text
Competition Change Check (Seconds)
```

When both rows exist, the plural row supplies `competitionChangeCheckSeconds` and its administrative Enable state. Conflicting values still produce `REFRESH_SETTING_CONFLICT`. Matching values do not create a conflict. If the plural row is absent, the singular row is used; if both are absent, the normalized value is null.

## Refresh API consistency

`publicWebsiteSettings_()` now receives the same normalized refresh configuration used by the site and provider response builders.

For `Value = FALSE, Enable = TRUE`:

```json
{
  "flags": { "Auto Data Refresh": false },
  "administrativeFlags": { "Auto Data Refresh": true },
  "configuredValues": { "Auto Data Refresh": false },
  "effectiveRefresh": { "autoDataRefresh": false }
}
```

For `Value = TRUE, Enable = FALSE`:

```json
{
  "flags": { "Auto Data Refresh": false },
  "administrativeFlags": { "Auto Data Refresh": false },
  "configuredValues": { "Auto Data Refresh": true },
  "effectiveRefresh": { "autoDataRefresh": false }
}
```

For all approved settings enabled:

```json
{
  "flags": { "Auto Data Refresh": true },
  "administrativeFlags": { "Auto Data Refresh": true },
  "effectiveRefresh": {
    "autoDataRefresh": true,
    "competitionChangeCheckSeconds": 5,
    "generalDataChangeCheckSeconds": 15
  }
}
```

The v1 `refreshSeconds` field remains present. No Phase 05 polling, triggers, version tracking, caching redesign, or live synchronization was added.

## Independent delivery

The delivery ZIP includes the complete available local implementation and verification sources:

- `apps-script/Code.gs`
- `apps-script/provider-adapters.gs`
- `apps-script/README.md`
- `apps-script/appsscript.json`
- all Phase 03 implementation and verification documents
- `tests/apps-script.test.mjs`
- `tests/build.test.mjs`
- all other existing tests
- `package.json` and `package-lock.json`
- existing `public/` and `scripts/` sources required by the available test/build project

No fake asset or placeholder data was added.
