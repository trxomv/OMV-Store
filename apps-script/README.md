# Central OMV Store Apps Script API

This folder contains the source for one read-only Apps Script Web App serving the main configuration workbook and all provider workbooks. The new script is source-only in this project; it has not been deployed and no live workbook or Apps Script deployment has been changed.

## Security and configuration

The script reads the main workbook ID only from Apps Script **Script Properties** using the property name `OMV_MAIN_CONFIG_ID`. It then looks up each provider's `Spreadsheet_ID` dynamically from the `Telecom Providers` tab. Do not add workbook IDs, credentials, or secrets to `public/`, browser JavaScript, or HTML.

The deployment requires a Google account that can read the main configuration workbook and each enabled provider workbook. The source uses the `spreadsheets.readonly` OAuth scope and contains no `doPost` or spreadsheet write operations. The public JSON response intentionally contains configured offers and public site content, but not source workbook IDs.

## Manual setup and deployment

The owner performs these steps after reviewing the source; this repository does not deploy it:

1. Create a new standalone Google Apps Script project. Do not replace or edit the existing live WE project.
2. Add the contents of `Code.gs` to the new project. If the manifest is edited in the Apps Script editor, enable **Show `appsscript.json` manifest file in editor settings** and copy `appsscript.json` from this folder.
3. In **Project Settings → Script Properties**, add `OMV_MAIN_CONFIG_ID` with the ID of the Main Configuration workbook. Keep this value in Script Properties only.
4. Confirm the account that will deploy the Web App has read access to Main Configuration and to every workbook currently listed as enabled in `Telecom Providers`. Review all rows and sharing settings before making the endpoint public.
5. Authorize the script when prompted. The requested spreadsheet scope is read-only.
6. Choose **Deploy → New deployment → Web app**. Set **Execute as** to the deploying owner and access to **Anyone** if the public website is intended to read the API. Review Google's public-access policy and the exact response fields before confirming. The deployment owner, not this agent, makes this choice and deployment.
7. Copy the resulting `/exec` URL into `centralApiEndpoint` in `public/site-config.js` only after deployment. Do not put workbook IDs in that file. Rebuild and test the site locally before any separate hosting decision.

If the Apps Script deployment is revised, create a new deployment version as appropriate and re-test all resources. The website must continue to use the central endpoint only; do not wire in legacy provider-specific endpoints.

## API request contract

All requests are HTTP GET. The `resource` parameter is required:

- `?resource=site` returns public website settings, the provider summary, active announcements, active social/contact rows, payment methods and main-workbook terms.
- `?resource=provider&id=2` returns one provider's normalized data, source table states, Page Settings, router/terms sections, shared content targeted to that provider, and a WE compatibility payload under `we` for provider ID 2 only.
- `?resource=routers` returns the enabled `All Routers` catalog and provider section states.

For browser access across Apps Script origins, an optional validated JSONP callback is supported:

```text
<deployed-exec-url>?resource=site&callback=omvCallback_1
<deployed-exec-url>?resource=provider&id=2&callback=omvCallback_2
<deployed-exec-url>?resource=routers&callback=omvCallback_3
```

The callback must be a simple JavaScript identifier and is rejected if it contains executable syntax. Without a callback, the endpoint returns JSON.

## Example response shapes

A `site` response has the following general shape (values depend on the current workbooks):

```json
{
  "ok": true,
  "apiVersion": 1,
  "resource": "site",
  "sourceStatus": "available",
  "refreshSeconds": 15,
  "providers": [
    {
      "id": 2,
      "slug": "we",
      "name": "WE",
      "enabled": true,
      "pageEnabled": true,
      "offersEnabled": true,
      "routersEnabled": true,
      "sourceStatus": "available",
      "status": "available"
    }
  ],
  "announcements": [],
  "contacts": [],
  "paymentMethods": []
}
```

A provider response includes `provider`, `pageEnabled`, `pageState`, `pageSettings`, `sections.offers`, `sections.routers`, `sections.terms`, `terms`, `tables`, and `site`. For WE it also includes `we`, adapted to the shape consumed by the existing WE data normalizer. The price calculation remains in the existing `public/js/data/customizer-core.js`; this Apps Script does not calculate or change package prices.

A routers response includes `sectionEnabled`, `sourceStatus`, `providers`, and `routers`. Only rows with an enabled record, a non-empty router name, and a positive final price are eligible. `Show Offer` affects whether a discount is displayed; it does not by itself enable a router.

## Source-state semantics

The response distinguishes empty data from structural/access failures. Depending on the source, statuses include `available`, `empty`, `disabled`, `not_found`, `missing_headers`, `not_applicable`, `inaccessible`, `unsupported_schema`, and `error`. A missing sheet, inaccessible workbook, or unsupported header layout is not silently converted into a valid product record. Plan rows must also satisfy the source's `Show Rate Plan`/`Show` control and required data checks; offers are only shown when the provider and relevant Page Settings permit them.

Provider IDs are stable: `1=Vodafone`, `2=WE`, `3=Orange`, `4=Etisalat`. A workbook's ID is resolved from Main Configuration at request time; it is not hard-coded in this source.

## Cache and refresh

The script uses Apps Script `CacheService` with separate cache keys for main configuration, site, provider, and router resources. TTL derives from the enabled `Auto Refresh Seconds` value in Main Configuration, with a safe range and Apps Script cache limit. The browser uses the same returned refresh interval for live refresh. On a preview with an empty endpoint, the browser reads `public/data/preview-snapshot.json` instead; this dated file is a fixed review snapshot and is not live or automatically synchronized.

## Local checks

From the project root:

```bash
npm test
npm run build
npm run dev
```

The test suite runs Apps Script functions inside a mocked, read-only workbook environment; it does not contact Google or verify a live deployment. No live API verification is possible until the owner deploys the new script manually. The current project intentionally leaves `centralApiEndpoint` empty.
