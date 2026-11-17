# Workbook-to-site data map

This map records the central API's allowlisted tab mapping and the site's use of source controls. No spreadsheet IDs, sharing URLs, credentials, or keys are stored here.

## Main Configuration workbook

| Workbook tab | Site/API use | Relevant controls |
| --- | --- | --- |
| `Telecom Providers` | Provider registry and dynamic provider-workbook lookup | `Provider_ID`, `Provider_Name`, `Spreadsheet_ID`, `Enable`; only public provider metadata is returned |
| `Main Categories` | Enable/disable homepage provider group and All Routers catalog | `Category ID` or `Category Name`, `Enable` |
| `Website Settings` | Per-provider page visibility and site behavior | `Show <Provider> Page`, `Auto Refresh Seconds`, other existing site settings |
| `Social Media` | Contact links on the homepage/provider pages | `Enable`, `Target`, `Contact Type`, `Value`; unknown targets are not treated as global |
| `Payment Methods` | Enabled payment method marks on site/WE surfaces | `Payment Method`, `Enable` |
| `Announcements` | Global/provider/router announcements | `Enable`, `Target`, `Value`; only `All` and explicit provider/router targets are used |
| `Terms&Conditions` | Optional general site terms | `Enable`, `Term_Text`, `Term_Type`, `Display_Order` when present; absent or uninspected content is not invented |

## Provider workbooks

The provider ID is obtained from Main Configuration at request time. IDs are stable: `1=Vodafone`, `2=WE`, `3=Orange`, `4=Etisalat`.

| Provider | Provider-specific sheets read by the central script |
| --- | --- |
| Vodafone | `Mobile_Rate Plans-Website`, `Page Settings`, `Vodafone-Routers`, `Vodafone-Routers_Details`, `Terms&Conditions` |
| WE | `Mobile_Rate Plans-Website`, `Mobile_Plans to EOM-Website`, `Mobile_Plans to 15-Website`, `WE-Air_Rate Plans-Website`, `Page Settings`, `WE-Routers`, `WE-Routers_Details`, `We-Terms&Conditions`, `Custom Pricing`, `Add-on` |
| Orange | `Mobile_Rate Plans-Website`, `Page Settings`, `Orange-Routers`, `Orange-Routers_Details`, `Orange-Terms&Conditions` |
| Etisalat | `Mobile_Rate Plans-Website`, `Page Settings`, `Etisalat-Routers`, `Etisalat-Routers_Details`, `Etisalat-Terms&Conditions` |

## Display and data-integrity rules

- `Enable` controls whether a provider or router record can be shown. `Show Offer` controls promotional price presentation, not the base record's eligibility. Plan tables honor their source `Show Rate Plan` or `Show` control; Page Settings determine whether provider sections are visible.
- Router records are shown only when enabled, named, and supplied with a positive final price. Router details join by `Router ID`; no router image, specification, or price is synthesized.
- Provider terms are displayed only when enabled and non-empty, ordered by `Display_Order`; term categories remain source-driven (`General`, `Important`, `Renewal`).
- Announcements and contacts respect `Enable` and `Target`; an undocumented numeric target is not interpreted as a provider ID.
- Source states such as `empty`, `not_found`, `missing_headers`, `inaccessible`, `unsupported_schema`, and `error` remain distinct. A missing/unavailable workbook is not represented as a confirmed empty sheet.
- WE's legacy-compatible data payload transports source tables into the existing WE data normalizer. It does not replace the formulas in `public/js/data/customizer-core.js`.

## Export and snapshot scope

The supplied `sheets/` directory contains `OMV-Store_Main Configuration.xlsx` and `We_Page-Website.xlsx`. It does not contain workbook export files for Vodafone, Orange, or Etisalat. The dated browser snapshot includes the reviewed provider responses available at snapshot time; it is a fixed, non-live preview fixture dated 2026-11-11, not evidence of later workbook changes.
