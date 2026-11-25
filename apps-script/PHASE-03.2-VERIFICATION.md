# OMV Store Phase 03.2 — Final Corrections & Contract Consistency

## Status

**PARTIALLY COMPLETED**. The Apps Script adapter/API corrections are implemented and tested locally. The complete website build remains blocked by the pre-existing missing asset `public/assets/images/sim-hero.webp`.

## Refresh contract

The normalized refresh configuration now distinguishes configured values from effective behavior:

```json
{
  "autoDataRefresh": true,
  "competitionChangeCheckSeconds": 5,
  "generalDataChangeCheckSeconds": 15,
  "enabled": {
    "autoDataRefresh": true,
    "competitionChangeCheckSeconds": true,
    "generalDataChangeCheckSeconds": true
  },
  "effective": {
    "autoDataRefresh": true,
    "competitionChangeCheckSeconds": 5,
    "generalDataChangeCheckSeconds": 15
  }
}
```

A missing, disabled, or false-valued global setting makes effective automatic refresh false and both effective intervals null. Competition and general-data intervals remain independent when the global switch is active. The legacy `refreshSeconds` field remains in the v1 response; for approved settings it is the effective general-data interval, or zero when no effective general interval exists. The site response also exposes `refreshConfiguration`. Browser polling, triggers, version tracking, and synchronization remain outside this phase.

Plural competition setting names take precedence over the singular alias. Conflicting values produce `REFRESH_SETTING_CONFLICT` diagnostics.

## Provider identity contract

All provider-related response paths now use canonical string `providerId` values and preserve numeric legacy `id` values:

| Provider | `providerId` | legacy `id` |
|---|---|---:|
| Vodafone | `VF` | 1 |
| WE | `TE` | 2 |
| Orange | `ORA` | 3 |
| Etisalat | `ET` | 4 |

Router provider states and normalized router records use the same canonical IDs. Router records also retain `providerLegacyId` for compatibility diagnostics; router device IDs remain in `routerId`.

## Main-resource schema evidence

`Router Offers` and `Master_Plans` are now represented by explicit schema-definition entries. The delivered Phase 02/03 files define their logical resources and physical sheet mappings but do not provide an authoritative physical header list for either worksheet. Therefore no invented required headers were added.

The runtime still detects duplicate normalized headers for both resources. The response marks valid reads with `schema.status = "not_established"` and a diagnostic reason. Once the owner supplies the approved physical header contracts, required-header validation can be made strict without risking false rejection of live data.

## Verification

Commands executed:

```bash
npm test
npm run build
git diff --check
```

Results:

- `npm test`: **67 passed, 0 failed**
- `git diff --check`: **passed**
- `npm run build`: **failed** on missing `public/assets/images/sim-hero.webp`

The test suite covers global refresh enabled/disabled paths, independent interval enablement, alias precedence and conflicts, API refresh response fields, all four provider canonical/legacy IDs, router canonical IDs, Main Terms, home plans, Router Offers and Master_Plans mapped reads, duplicate diagnostics, optional worksheets, legacy v1 behavior, and existing WE/frontend regressions.

## Safety

No Google Sheets were modified. No Competition Entries records were written. No Apps Script deployment or endpoint change was made. No website deployment, hosting change, GitHub push, or Git commit was performed. No protected WE pricing module was modified. Phase 04 was not started.
