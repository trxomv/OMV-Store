import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

function readCentralEndpoint(source) {
  const declarations = [...source.matchAll(/^\s*centralApiEndpoint\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm)];
  if (declarations.length !== 1) throw new Error("site-config.js must declare exactly one centralApiEndpoint string.");
  const value = JSON.parse(declarations[0][1]);
  if (!value) return "";
  let url;
  try { url = new URL(value); } catch { throw new Error("centralApiEndpoint must be empty or a valid Apps Script URL."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname) || url.username || url.password || url.hash) {
    throw new Error("centralApiEndpoint must be the public HTTPS /exec URL of the new read-only central API.");
  }
  return url.href;
}

const configSource = await readFile(path.join(publicDir, "site-config.js"), "utf8");
const endpoint = readCentralEndpoint(configSource);
const routesDocument = JSON.parse(await readFile(path.join(publicDir, "manus-routes.json"), "utf8"));
const expectedRoutes = ["/", "/vodafone/", "/we.html", "/orange/", "/etisalat/", "/provider.html", "/routers.html", "/competitions.html"];
if (Object.keys(routesDocument).length !== 1 || !Array.isArray(routesDocument.routes)) throw new Error("manus-routes.json must contain only a routes array.");
const actualRoutes = routesDocument.routes.map((route) => route.path);
if (JSON.stringify(actualRoutes) !== JSON.stringify(expectedRoutes)) throw new Error(`manus-routes.json must declare: ${expectedRoutes.join(", ")}.`);
if (routesDocument.routes.some((route) => !route.path.startsWith("/") || route.path.startsWith("//"))) throw new Error("All page routes must be site-relative absolute paths.");

async function assertNoSpreadsheetIds(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertNoSpreadsheetIds(file);
    else if (/\.(?:html|js|json|css)$/i.test(entry.name)) {
      const text = await readFile(file, "utf8");
      if (/docs\.google\.com\/spreadsheets|Spreadsheet_ID|spreadsheetId/i.test(text)) {
        throw new Error(`Frontend file contains a spreadsheet identifier or field name: ${path.relative(publicDir, file)}`);
      }
    }
  }
}
await assertNoSpreadsheetIds(publicDir);

const requiredFiles = [
  "index.html", "we.html", "provider.html", "routers.html", "competitions.html", "site-config.js", "manus-routes.json",
  "data/homepage-config.json", "data/preview-snapshot.json",
  "css/home.css", "css/catalog.css", "css/main.css", "css/components.css", "css/responsive.css", "css/refinement.css",
  "js/homepage.js", "js/provider-page.js", "js/routers-page.js", "js/competitions-page.js", "js/we-integration.js",
  "js/app.js", "js/data/data-core.js", "js/data/customizer-core.js", "js/data/provider-adapters.js", "js/data/multi-provider-client.js", "js/data/provider-page-rules.js",
  "js/components/addon-row.js", "js/components/payment-logo.js", "js/components/source-badges.js", "js/components/router-card.js", "js/utils/dom.js", "js/utils/format.js",
  "assets/images/sim-hero.svg", "assets/brand/omv-logo.webp",
  "vodafone/index.html", "orange/index.html", "etisalat/index.html",
  "assets/icons/addon-phone.svg", "assets/icons/addon-data.svg", "assets/icons/addon-generic.svg",
];
for (const file of requiredFiles) await readFile(path.join(publicDir, file));

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
for (const page of ["index.html", "vodafone/index.html", "we.html", "orange/index.html", "etisalat/index.html", "provider.html", "routers.html", "competitions.html"]) await readFile(path.join(distDir, page));
console.log(`Built independent static website to dist/ (${endpoint ? "central live endpoint configured" : "reviewed snapshot mode; not live data"}).`);
