import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { providerFirstBadgeText, sourceBadgeText } from "../public/js/components/source-badges.js";
import {
  createRouterSourceTableLoader,
  enrichRouterRows,
  routerBelongsToProvider,
  routerImagePath,
  routerPriceDisplay,
  routerSectionEnabled,
} from "../public/js/components/router-card.js";

const refinementCss = await readFile(new URL("../public/css/refinement.css", import.meta.url), "utf8");

test("source badges preserve the exact source label and keep first and second positions independent", () => {
  const record = { "First Badge": "  Source First  ", "Second Badge": "Source Second" };
  assert.equal(sourceBadgeText(record, "first"), "Source First");
  assert.equal(sourceBadgeText(record, "second"), "Source Second");
  assert.equal(sourceBadgeText(record, "unknown"), "");
});

test("empty and explicitly disabled source badges are not displayed", () => {
  assert.equal(sourceBadgeText({ "First Badge": "   ", "Second Badge": "" }, "first"), "");
  assert.equal(sourceBadgeText({ "First Badge": "--", "Second Badge": "off" }, "first"), "");
  assert.equal(sourceBadgeText({ "First Badge": "First", "First Badge Enable": false }, "first"), "");
  assert.equal(sourceBadgeText({ "Second Badge": "Second", "Enable Second Badge": "No" }, "second"), "");
  assert.equal(sourceBadgeText({ "First Badge": "First", "First Badge Enable": true }, "first"), "First");
});

test("provider legacy badge is used only when split badge fields are absent", () => {
  assert.equal(providerFirstBadgeText({ Badge: "Legacy badge" }), "Legacy badge");
  assert.equal(providerFirstBadgeText({ "First Badge": "First", Badge: "Legacy badge" }), "First");
  assert.equal(providerFirstBadgeText({ "Second Badge": "Second", Badge: "Legacy badge" }), "");
  assert.equal(providerFirstBadgeText({ "First Badge": "", "Second Badge": "Second", Badge: "Legacy badge" }), "");
  assert.equal(providerFirstBadgeText({ "First Badge": "First", "First Badge Enable": false, Badge: "Legacy badge" }), "");
});

test("router records are enriched only by a unique matching Router ID and retain their API values", () => {
  const records = [
    { routerId: "TE_RTR_201", providerId: "TE", providerName: "WE", showOffer: false, finalPrice: 950 },
    { routerId: "R-duplicate", providerId: "VF", providerName: "Vodafone", finalPrice: 700 },
    { routerId: "R-no-match", providerId: "ORA", providerName: "Orange", finalPrice: 600 },
  ];
  const table = { rows: [
    { "Router ID": "TE_RTR_201", "First Badge": "Source First", "Second Badge": "Source Second" },
    { "Router ID": "R-duplicate", "First Badge": "Ambiguous A" },
    { "Router ID": "R-duplicate", "First Badge": "Ambiguous B" },
  ] };
  const enriched = enrichRouterRows(records, table);
  assert.equal(enriched[0].firstBadge, "Source First");
  assert.equal(enriched[0].secondBadge, "Source Second");
  assert.equal(enriched[0].showOffer, false);
  assert.equal(enriched[0].finalPrice, 950);
  assert.equal("firstBadge" in enriched[1], false);
  assert.equal("firstBadge" in enriched[2], false);
  assert.notEqual(enriched[0], records[0]);
});

test("router source tables are reused within one refresh and reloaded after cache invalidation", async () => {
  let revision = 0;
  let requests = 0;
  const loader = createRouterSourceTableLoader(async () => {
    requests += 1;
    const currentRevision = revision;
    return { payload: { tables: { routers: { rows: [{ "Router ID": "R1", "First Badge": `Badge ${currentRevision}` }] } } } };
  });

  const initial = await loader.load("VF");
  revision = 1;
  const sameCycle = await loader.load(1);
  assert.equal(requests, 1);
  assert.equal(enrichRouterRows([{ routerId: "R1" }], initial)[0].firstBadge, "Badge 0");
  assert.equal(enrichRouterRows([{ routerId: "R1" }], sameCycle)[0].firstBadge, "Badge 0");

  loader.clear();
  const refreshed = await loader.load("VF");
  assert.equal(requests, 2);
  assert.equal(enrichRouterRows([{ routerId: "R1" }], refreshed)[0].firstBadge, "Badge 1");
});

test("router image paths include only the existing local source asset", () => {
  assert.equal(routerImagePath({ routerId: "TE_RTR_201", providerId: "TE" }), "/assets/routers/we/TE_RTR_201.jpg");
  assert.equal(routerImagePath({ routerId: "VF_RTR_1", providerId: "VF" }), "");
  assert.equal(routerImagePath({ routerId: "../TE_RTR_201", providerId: "TE" }), "");
});

test("router offer visibility is independent from router section visibility and never overrides its price", () => {
  assert.equal(routerSectionEnabled({ enabled: true, showOffer: false }), true);
  assert.equal(routerSectionEnabled({ enabled: false, showOffer: true }), false);
  assert.deepEqual(routerPriceDisplay({ finalPrice: 950, discountPrice: 800, showOffer: false }), {
    finalPrice: "950",
    discountPrice: "",
  });
  assert.deepEqual(routerPriceDisplay({ finalPrice: 950, discountPrice: 800, showOffer: true }), {
    finalPrice: "950",
    discountPrice: "800",
  });
  assert.deepEqual(routerPriceDisplay({ finalPrice: 950, discountPrice: 1000, showOffer: true }), {
    finalPrice: "950",
    discountPrice: "",
  });
});

test("router filters match both canonical and legacy provider identifiers", () => {
  assert.equal(routerBelongsToProvider({ providerId: "VF" }, "1"), true);
  assert.equal(routerBelongsToProvider({ providerLegacyId: 3, providerId: "ORA" }, "3"), true);
  assert.equal(routerBelongsToProvider({ canonicalProviderId: "ET" }, "4"), true);
  assert.equal(routerBelongsToProvider({ providerId: "TE" }, "3"), false);
  assert.equal(routerBelongsToProvider({}, "all"), true);
});

test("shared card grids declare the one/two/three/four-column responsive breakpoints", () => {
  assert.match(refinementCss, /#we-router-list/);
  assert.match(refinementCss, /@media\s*\(max-width:\s*600px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(refinementCss, /@media\s*\(min-width:\s*601px\)\s*and\s*\(max-width:\s*1100px\)[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(refinementCss, /@media\s*\(min-width:\s*1360px\)[\s\S]*auto-fit,\s*minmax\(min\(100%,\s*250px\),\s*1fr\)/);
  assert.match(refinementCss, /grid-auto-rows:\s*1fr/);
});

test("the WE package-card glow stays inside the card and cannot widen the document", () => {
  assert.match(refinementCss, /\.offer-card::before\s*\{\s*inset-inline-end:\s*0;/);
});
