import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const [html, homeCss, catalogCss, homepageJs, configText, weHtml, appJs, providerHtml, providerJs, routersHtml, routersJs, routeText, endpointConfig, snapshotText, adapterJs, weIntegration] = await Promise.all([
  read("public/index.html"), read("public/css/home.css"), read("public/css/catalog.css"), read("public/js/homepage.js"),
  read("public/data/homepage-config.json"), read("public/we.html"), read("public/js/app.js"),
  read("public/provider.html"), read("public/js/provider-page.js"), read("public/routers.html"), read("public/js/routers-page.js"),
  read("public/manus-routes.json"), read("public/site-config.js"), read("public/data/preview-snapshot.json"),
  read("public/js/data/provider-adapters.js"), read("public/js/we-integration.js"),
]);
const config = JSON.parse(configText);
const snapshot = JSON.parse(snapshotText);
const routes = JSON.parse(routeText);

 test("homepage is Arabic RTL, dark by default, and links to the preserved WE page and separate router catalog", () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /href="css\/home\.css"/);
  assert.match(html, /src="js\/homepage\.js"/);
  assert.match(html, /href="we\.html"/);
  assert.match(html, /href="routers\.html"/);
  assert.match(html, /id="providers"[\s\S]*id="routers"[\s\S]*id="announcements"[\s\S]*id="contact"/);
  assert.match(html, /id="data-mode-banner"/);
  assert.match(homeCss, /color-scheme:\s*dark/);
  assert.match(homeCss, /--purple:\s*#a554ff/);
  assert.match(homeCss, /prefers-reduced-motion/);
});

test("stable provider cards are always built for IDs 1–4 and use coming-soon fallbacks without sheet identifiers", () => {
  assert.deepEqual(config.providerFallbacks.map((provider) => Number(provider.id)), [1, 2, 3, 4]);
  assert.match(homepageJs, /\[1, 2, 3, 4\]\.map/);
  assert.match(homepageJs, /provider\.html\?id=/);
  assert.match(homepageJs, /const FALLBACK_PROVIDERS = \[1, 2, 3, 4\]\.map/);
  assert.match(adapterJs, /empty:\s*"قريبًا"/);
  assert.match(homepageJs, /providerAnnouncements/);
  assert.doesNotMatch(configText + endpointConfig, /Spreadsheet_ID|spreadsheetId|1yTtzviCGjNALFlMFgFdvjfyDgDAJ_7_NDqccJ53orGg|16Au8ERRsELBR96LSG_lxRCOcjT6GVK_MaXy_R9vnrIs/);
});

test("homepage renders global, provider and router-targeted announcements and source terms safely", () => {
  assert.match(homepageJs, /visibleAnnouncements\(site\.announcements/);
  assert.match(homepageJs, /providerAnnouncements\(site\.announcements/);
  assert.match(homepageJs, /routerAnnouncements\(site\.announcements/);
  assert.match(homepageJs, /normalizeTerms\(site\.terms/);
  assert.match(homepageJs, /terms-content/);
  assert.match(html, /id="router-announcements"/);
  assert.match(html, /id="terms-content"/);
  assert.match(html, /id="router-catalog-link" href="routers\.html"/);
});

test("provider template supports Vodafone, Orange and Etisalat by ID while WE remains on its original route", () => {
  assert.match(providerHtml, /lang="ar" dir="rtl"/);
  assert.match(providerJs, /const queryId = Number\(new URLSearchParams\(window\.location\.search\)\.get\("id"\)\)/);
  assert.match(providerJs, /queryId === 2/);
  assert.match(providerJs, /window\.location\.replace\("we\.html"\)/);
  assert.match(providerJs, /loadResource\("provider", queryId\)/);
  assert.match(providerJs, /visiblePlanRows\(table\)/);
  assert.match(providerJs, /offerForPlan\(row, true\)/);
  assert.match(providerJs, /payload\.sections\?\.routers/);
  assert.match(providerJs, /payload\.sections\?\.terms/);
  assert.doesNotMatch(providerJs, /(?:price|finalPrice)\s*[:=]\s*\d{2,}/i);
});

test("routers catalog is a separate route, filters shared provider records and invents no inventory", () => {
  assert.match(routersHtml, /id="provider-filter"/);
  assert.match(routersHtml, /id="router-empty"/);
  assert.match(routersJs, /loadResource\("routers"\)/);
  assert.match(routersJs, /routerRecords\.filter/);
  assert.match(routersJs, /لا توجد راوترات مكتملة ومفعّلة/);
  assert.match(catalogCss, /@media \(max-width: 600px\)/);
  assert.match(catalogCss, /grid-template-columns: 1fr/);
});

test("WE integration keeps the existing app and pricing core entry while adding central router/terms sections", () => {
  assert.match(weHtml, /css\/main\.css/);
  assert.match(weHtml, /css\/components\.css/);
  assert.match(weHtml, /css\/responsive\.css/);
  assert.match(weHtml, /type="module" src="js\/app\.js"/);
  assert.match(weHtml, /type="module" src="js\/we-integration\.js"/);
  assert.match(weHtml, /id="customizer-panel"/);
  assert.match(weHtml, /href="\/" aria-label="العودة إلى OMV Store الرئيسية"/);
  assert.match(weHtml, /id="we-router-section"/);
  assert.match(weHtml, /id="we-terms-section"/);
  assert.match(appJs, /loadResource\("provider", 2\)/);
  assert.match(appJs, /result\.payload\?\.we/);
  assert.match(appJs, /renderSourceBanner/);
  assert.match(weIntegration, /loadResource\("provider", 2\)/);
  assert.match(weIntegration, /payload\.sections\?\.routers/);
  assert.match(weIntegration, /payload\.sections\?\.terms/);
});

test("central endpoint is configured and the snapshot remains an explicit safe fallback", () => {
  assert.match(endpointConfig, /centralApiEndpoint:\s*"https:\/\/script\.google\.com\/macros\/s\/[^\"]+\/exec"/);
  assert.match(snapshotText, /"sourceMode":\s*"snapshot"/);
  assert.match(snapshot.notice, /ليست بيانات مباشرة/);
  assert.match(snapshot.site.providers.map((provider) => provider.id).join(","), /1,2,3,4/);
  assert.doesNotMatch(snapshotText, /spreadsheetId|Spreadsheet_ID|1yTtzviCGjNALFlMFgFdvjfyDgDAJ_7_NDqccJ53orGg|16Au8ERRsELBR96LSG_lxRCOcjT6GVK_MaXy_R9vnrIs/);
});

test("route manifest declares all source pages and does not include APIs/assets", () => {
  assert.deepEqual(routes.routes.map((route) => route.path), ["/", "/we.html", "/provider.html", "/routers.html"]);
  assert.equal(Object.keys(routes).length, 1);
  assert.ok(routes.routes.every((route) => route.path.startsWith("/") && !route.path.startsWith("//")));
});

test("required pages and local source assets exist", async () => {
  for (const path of [
    "public/provider.html", "public/routers.html", "public/js/provider-page.js", "public/js/routers-page.js",
    "public/js/we-integration.js", "public/css/catalog.css", "public/data/preview-snapshot.json",
    "apps-script/Code.gs", "apps-script/README.md",
  ]) await access(resolve(root, path));
});
