import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");
const [config, buildScript, serveScript, appsScript, manifest, frontend, addonComponent, weHtml, homeHtml, providerHtml, routersHtml, homepageConfig, routeText] = await Promise.all([
  read("public/site-config.js"), read("scripts/build.mjs"), read("scripts/serve.mjs"), read("apps-script/Code.gs"), read("apps-script/appsscript.json"),
  read("public/js/app.js"), read("public/js/components/addon-row.js"), read("public/we.html"), read("public/index.html"),
  read("public/provider.html"), read("public/routers.html"), read("public/data/homepage-config.json"), read("public/manus-routes.json"),
]);
const routes = JSON.parse(routeText);

 test("one optional central endpoint configuration is used without frontend spreadsheet IDs or credentials", () => {
  assert.match(config, /centralApiEndpoint\s*:/);
  assert.equal((config.match(/centralApiEndpoint\s*:/g) || []).length, 1);
  assert.doesNotMatch(config + homeHtml + weHtml + providerHtml + routersHtml + frontend, /docs\.google\.com\/spreadsheets|Spreadsheet_ID|spreadsheetId|201554551710|CAGWbmHZLx0B1zIF5sQzRc|K6sC-Da1_VBjNTRk/i);
  assert.match(config, /centralApiEndpoint:\s*"https:\/\/script\.google\.com\/macros\/s\/[^\"]+\/exec"/);
  assert.doesNotMatch(homepageConfig, /Spreadsheet_ID|spreadsheetId/);
});

test("static build validates the complete route manifest and copies the whole public tree", () => {
  for (const page of ["/", "/we.html", "/provider.html", "/routers.html"]) assert.ok(routes.routes.some((route) => route.path === page));
  assert.match(buildScript, /centralApiEndpoint/);
  assert.match(buildScript, /script\.google\.com/);
  assert.match(buildScript, /await cp\(publicDir, distDir, \{ recursive: true \}\)/);
  assert.match(buildScript, /manus-routes\.json/);
  for (const file of ["provider.html", "routers.html", "we.html", "data/preview-snapshot.json", "css/catalog.css", "js/provider-page.js", "js/routers-page.js", "js/we-integration.js"]) assert.ok(buildScript.includes(file));
  assert.match(buildScript, /assertNoSpreadsheetIds/);
  assert.match(serveScript, /centralApiEndpoint/);
  assert.doesNotMatch(serveScript, /sheetsEndpoint/);
});

test("central Apps Script is dynamic, read-only, cache-backed and declares only spreadsheet read scope", () => {
  for (const sheet of ["Telecom Providers", "Main Categories", "Website Settings", "Social Media", "Payment Methods", "Announcements", "Mobile_Rate Plans-Website", "Page Settings", "WE-Routers", "Terms&Conditions"]) assert.ok(appsScript.includes(sheet), `missing central data mapping ${sheet}`);
  assert.match(appsScript, /PropertiesService\.getScriptProperties\(\)\.getProperty\(MAIN_ID_PROPERTY_\)/);
  assert.match(appsScript, /Spreadsheet_ID/);
  assert.match(appsScript, /function\s+doGet\(/);
  assert.doesNotMatch(appsScript, /function\s+doPost\s*\(/);
  assert.doesNotMatch(appsScript, /\.setValue\s*\(|\.appendRow\s*\(|\.deleteRow\s*\(/);
  assert.match(appsScript, /CacheService\.getScriptCache\(\)/);
  assert.match(appsScript, /function\s+discountFromFormula_/);
  assert.doesNotMatch(appsScript, /Final Price Formula/);
  assert.match(manifest, /spreadsheets\.readonly/);
  assert.match(manifest, /ANYONE_ANONYMOUS/);
  assert.match(manifest, /USER_DEPLOYING/);
});

test("local payment and add-on assets remain bundled with the WE feature components", async () => {
  for (const asset of ["vodafone-cash.webp", "orange-cash.webp", "instapay.webp", "telda.webp", "etisalat-money.webp"]) {
    const metadata = await stat(new URL(`../public/assets/payment-methods/${asset}`, import.meta.url));
    assert.ok(metadata.size > 500, `${asset} should contain a local image`);
  }
  for (const icon of ["addon-phone.svg", "addon-data.svg", "addon-generic.svg"]) {
    const metadata = await stat(new URL(`../public/assets/icons/${icon}`, import.meta.url));
    assert.ok(metadata.size > 50, `${icon} should be bundled`);
  }
  assert.match(frontend, /paymentLogoCandidates\(method, PAYMENT_ASSETS\)/);
  assert.match(frontend, /paymentMethodMark\(method\.label\)/);
  assert.match(addonComponent, /addon-phone\.svg/);
  assert.match(addonComponent, /addon-data\.svg/);
  assert.match(addonComponent, /addon-generic\.svg/);
});

test("all four static page routes are declared and safe", () => {
  assert.deepEqual(routes.routes.map((route) => route.path), ["/", "/we.html", "/provider.html", "/routers.html"]);
  assert.equal(Object.keys(routes).length, 1);
  assert.ok(routes.routes.every((route) => route.title && route.path.startsWith("/") && !route.path.startsWith("//")));
});

test("WE source retains its existing app and customizer UI while consuming the central provider resource", () => {
  assert.match(weHtml, /type="module" src="js\/app\.js"/);
  assert.match(weHtml, /id="customizer-panel"/);
  assert.match(weHtml, /id="we-router-section"/);
  assert.match(weHtml, /id="we-terms-section"/);
  assert.match(frontend, /loadResource\("provider", 2\)/);
  assert.match(frontend, /result\.payload\?\.we/);
  assert.match(frontend, /customizerCore/);
  assert.match(frontend, /calculateCustomPrice/);
});

 test("homepage and independent provider/router pages load their own modules and local styles", () => {
  assert.match(homeHtml, /type="module" src="js\/homepage\.js"/);
  assert.match(providerHtml, /type="module" src="js\/provider-page\.js"/);
  assert.match(routersHtml, /type="module" src="js\/routers-page\.js"/);
  assert.match(homeHtml, /css\/home\.css/);
  assert.match(providerHtml, /css\/catalog\.css/);
  assert.match(routersHtml, /css\/catalog\.css/);
});
