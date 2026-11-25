# OMV Store Phase 03.4 — Refresh Fallback Finalization

## Status

**PARTIALLY COMPLETED**. The unsafe refresh fallback was removed and the complete local test suite passes. The website build remains blocked by the pre-existing missing `public/assets/images/sim-hero.webp` asset.

## Correction

`getRefreshSeconds_()` now treats the canonical `Auto Data Refresh` setting as authoritative.

Behavior:

- If `Auto Data Refresh` is missing, `refreshSeconds` is `0`.
- If `Auto Data Refresh` has `Value = FALSE`, `refreshSeconds` is `0`.
- If `Auto Data Refresh` has `Enable = FALSE`, `refreshSeconds` is `0`.
- A legacy positive `Auto Refresh Seconds` row can no longer activate polling.
- A positive default interval can no longer activate polling when the canonical setting is missing or inactive.
- When canonical global refresh is active, only the effective enabled `General Data Change Check (Seconds)` value is exposed through v1 `refreshSeconds`.
- Missing, disabled, or invalid general intervals return `refreshSeconds = 0`.
- Competition interval handling remains independent and is not substituted into `refreshSeconds`.
- Plural/singular competition alias precedence and conflict diagnostics remain unchanged.

The existing v1 `refreshSeconds` field is preserved.

## Tests

Added focused tests for:

1. Missing canonical global setting with no legacy row.
2. Missing canonical global setting with a positive legacy row.
3. Disabled canonical global setting with a positive legacy row.
4. Enabled canonical global setting with general interval 15.
5. Disabled general interval.
6. Missing general interval.
7. Invalid general interval.
8. Independent competition interval behavior.
9. Existing alias precedence and conflict diagnostics.
10. Consistency of flags, administrativeFlags, configuredValues, and effectiveRefresh.

Final command results:

```text
npm test       exit 0 — 71 passed, 0 failed
git diff --check exit 0 — passed
npm run build  exit 1 — missing public/assets/images/sim-hero.webp
```

## Safety

No Google Sheets, Apps Script deployments, production endpoints, website configuration, hosting, GitHub repositories, or production data were modified. No commit or push was performed. No protected WE module was changed. Phase 04 was not started.
