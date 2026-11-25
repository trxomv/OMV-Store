# OMV Store — Phase 04.4.3 Decision Record

## Decision

Use one shared responsive CSS Grid contract for WE and provider offer lists, with `auto-fit` and a 250px minimum card width. This restores the intended multi-card desktop/tablet behavior while guaranteeing one card per row on narrow mobile screens. Complete the offer-page experience with a shared source-backed terms dialog and a same-level competitions category that never fabricates unavailable data.

## Why this replaces Phase 04.4.2

Phase 04.4.2 forced all offer cards into a single desktop column. That regressed against the approved WE baseline and caused excessive vertical whitespace and unbalanced desktop presentation. Phase 04.4.3 removes the conflicting fixed-width/one-column layer instead of stacking another override on top of it.

## Responsive contract

Wide desktop uses fluid multi-column rows whenever the available width supports them. Desktop cards retain a 250px minimum width, tablet reduces columns through the same grid calculation, and mobile switches to one card per row below 420px. Card internals use Flexbox column flow, keeping facts, price, status, badges, and actions in normal layout flow. Actions use two equal columns with consistent gaps and wrapping-safe controls.

## Shared surface and terms decision

The existing WE contact, payment, header, announcement, hero, and card treatment remains the visual reference. Shared selectors apply that treatment across homepage, WE, Vodafone, Orange, and Etisalat while retaining all existing destinations, payment names, image assets, provider-specific content, and visibility logic. Each offer page now places a **الشروط والأحكام** trigger before offers. The trigger carries the requested animated **مهم** bubble and arrow; its scrollable dialog reads terms from the active rendered data and remains closable without changing the data contract.

## Competitions decision

Add **المسابقات** beside **الباقات** at the same classification level. Preserve the existing competition privacy/registration integration and worksheet mappings. Because the active Apps Script payload and local snapshot currently expose no competition rows, the renderer shows a safe empty state. No competition cards, endpoint, spreadsheet, or terms were invented.

## Protected scope

The protected business-logic files remain byte-for-byte unchanged. UI and presentation changes are limited to `public/css/refinement.css`, `public/js/app.js`, `public/js/terms-modal.js`, `public/js/provider-page.js`, the shared WE/provider templates, and the three nested provider route templates. No provider adapter, data core, customizer core, WE integration, endpoint, spreadsheet, Apps Script deployment, or production hosting setting was modified.

## Verification decision

Accept the phase for local review. The automated suite passed 73/73, the static build passed, all required routes returned HTTP 200, syntax checks passed, protected hashes matched, nested provider assets resolved, terms and competitions interactions passed, Chromium smoke checks reported no runtime error signatures, and 20 fresh viewport screenshots were generated. Production deployment remains intentionally out of scope.
