# OMV Store Phase 04.4 — Redesign Decision Record

**Mode:** Redesign · Preserve

## Preserve

- OMV Store's dark premium telecom identity and Arabic RTL layout.
- Existing page structure, canonical provider routes, legacy compatibility, assets, and data-driven rendering.
- Existing interactions, provider accents, package order, router semantics, availability states, disabled actions, WhatsApp behavior, terms behavior, and responsive route behavior.

## Improve

- Visual hierarchy and scanability through tighter section rhythm and clearer price/action emphasis.
- Shared spacing, typography, borders, radii, shadows, focus states, button sizing, and mobile touch targets.
- Consistency between homepage provider cards, catalog/provider cards, router cards, and WE package cards.
- Mobile density at 390px while retaining comfortable controls and no horizontal overflow.

## Remove or reduce

- Excessive decorative intensity and competing glow effects.
- Inconsistent card proportions, empty gaps, and oversized visual treatment.
- Price/discount ambiguity by keeping discount badges in a separate row from the price band.

## Protected contracts

No changes are made to provider adapters, provider IDs, data contracts, pricing/calculation/discount/availability rules, router calculations, competition logic, Apps Script, endpoints, Sheets, customizer-core.js, data-core.js, we-integration.js, or presentation JavaScript. The implementation is a CSS refinement layer linked after the existing stylesheets.


## Phase 04.4.1 focused refinement

The approved WE provider header is the shared reference. The provider header structure is reused for Vodafone, Orange, and Etisalat so the shell has one consistent responsive geometry while each provider retains its own existing header image, logo, title, accent, and availability state. The provider package cards use the same WE hierarchy: readable metadata, emphasized quota, dominant final price, secondary original price, separate discount treatment, aligned actions, and provider-specific accents.

The change intentionally stays CSS-first with only presentation-oriented header markup alignment in the shared provider template and three canonical provider entry points. Provider-specific content, package order, price values, discount calculations, availability logic, subscription destinations, WhatsApp behavior, route structure, and all protected JavaScript contracts remain unchanged. No production or external service was modified.
