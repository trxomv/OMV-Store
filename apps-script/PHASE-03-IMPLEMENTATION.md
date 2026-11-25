# OMV Store Phase 03 Implementation

## Scope and safety

This phase adds a local, read-only provider adapter layer. It does not write to Google Sheets, open or modify Competition Entries, change Script Properties, deploy Apps Script, change the configured public endpoint, deploy the website, or create a Git commit.

The implementation is split between:

- `provider-adapters.gs`: canonical provider registry, logical-to-physical worksheet mappings, header/schema helpers, refresh-settings normalization, canonical response/error helpers, and isolated Egyptian mobile normalization.
- `Code.gs`: the existing read-only v1 API, updated to consume the registry and mappings while preserving legacy numeric route fields and the existing WE transport payload.

Apps Script loads both `.gs` files in the same project. The Node test harness concatenates them only for local execution.

## Canonical provider boundary

The authoritative registry uses `VF`, `TE`, `ORA`, and `ET`. Legacy route IDs `1`, `2`, `3`, and `4` are resolved at the routing boundary only. Existing v1 response fields such as `id: 2` remain available for the current frontend; canonical `providerId: "TE"` is carried alongside them so a later API migration can remove the numeric transport field without changing live behavior in this phase.

Unknown or malformed provider values resolve to a controlled empty result and never default to WE.

## Physical worksheet mappings

The registry preserves the verified live worksheet names. Logical resources are resolved through provider-specific adapters; physical sheets are never renamed or rewritten. Legacy source-only names remain fallback candidates for compatibility with the existing mocked v1 fixtures.

The main workbook mapping includes `Telecom Providers`, `Main Categories`, `Router Offers`, `Master_Plans`, `Website Settings`, `Social Media`, `Payment Methods`, `Announcements`, and `OMV-Terms&Conditions`. The separate Competition Entries workbook is represented only as `{ resource: "competitionEntries", worksheet: "Competition Entries" }`; no spreadsheet is opened or written by Phase 03.

## Schema normalization

Header lookup normalizes harmless whitespace, punctuation, and case without changing physical headers. Missing required headers and duplicate normalized headers are reported as `UNSUPPORTED_SCHEMA`; optional headers may be absent. Terms normalize `Term_Titel` to `title` for main terms and preserve `title: null` for provider terms without a title.

Router visibility is provider-specific: Vodafone, Orange, and Etisalat use `Show Router`; WE uses `Enable`. `Show Offer` remains a separate field and is exposed as `visibility.deviceOffer`, while router visibility is exposed as `visibility.router`. Hiding an offer therefore does not hide the router.

## Refresh configuration

The adapter accepts `Auto Data Refresh`, `Competitions Change Check (Seconds)`, and `General Data Change Check (Seconds)`, including the singular competition alias. The plural spelling wins when both aliases exist. Different values are reported as a conflict rather than silently merged. Individual `Enable` values are preserved. Phase 03 does not implement polling, versions, cache invalidation, or browser refresh behavior; those remain deferred to Phase 05.

## Competition policy preparation

The approved future write policy is represented only as pure validation support and tests:

- the first two valid accepted entries receive ranks 1 and 2;
- the competition closes after rank 2;
- duplicates are keyed by `Competition_ID + normalized Phone_Number`;
- Egyptian mobile numbers only are accepted;
- canonical phone format is `201XXXXXXXXX`.

No `doPost`, write service, LockService submission workflow, customer record, or Competition Entries write was added.

## Validation

The baseline existing suite passed 52/52 before edits. The final suite passed 58/58. The repository build command was run after edits but remains blocked by the pre-existing missing source asset `public/assets/images/sim-hero.webp`; no asset or build-system change was made in this phase.
