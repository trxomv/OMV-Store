import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { providerFirstBadgeText, sourceBadgeText } from "../public/js/components/source-badges.js";
import {
  createRouterCard,
  createRouterSourceTableLoader,
  enrichRouterRows,
  routerBelongsToProvider,
  routerImagePath,
  routerPriceDisplay,
  routerSectionEnabled,
} from "../public/js/components/router-card.js";
const refinementCss = await readFile(new URL("../public/css/refinement.css", import.meta.url), "utf8");
const componentsCss = await readFile(new URL("../public/css/components.css", import.meta.url), "utf8");
const weAppSource = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
const providerPageSource = await readFile(new URL("../public/js/provider-page.js", import.meta.url), "utf8");

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = "";
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); } };
    this.hidden = false;
    this.textContent = "";
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  click() { this.listeners.get("click")?.({ currentTarget: this }); }
}

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

test("router details start collapsed and the accessible button toggles visibility and label", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new TestElement(tagName) };
  try {
    const card = createRouterCard({
      routerId: "R1",
      name: "راوتر للاختبار",
      providerId: "TE",
      providerName: "WE",
      finalPrice: 900,
      details: [{ section: "المواصفات", title: "السرعة", content: "300 ميجابت" }],
    });
    const toggle = card.children.find((child) => child.className === "router-details-toggle");
    const details = card.children.find((child) => child.className === "router-details");
    assert.ok(toggle);
    assert.ok(details);
    assert.equal(toggle.tagName, "button");
    assert.equal(toggle.type, "button");
    assert.equal(toggle.textContent, "عرض التفاصيل");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-controls"), details.id);
    assert.equal(details.hidden, true);

    toggle.click();
    assert.equal(toggle.textContent, "إخفاء التفاصيل");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(details.hidden, false);

    toggle.click();
    assert.equal(toggle.textContent, "عرض التفاصيل");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(details.hidden, true);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("second source badges are inserted before offer share and provider action buttons", () => {
  const weBadgePosition = weAppSource.indexOf("if (secondBadge) article.append(secondBadge)");
  const weActionsPosition = weAppSource.indexOf("if (settings.showCopyButton || settings.showShareButton)");
  const providerBadgePosition = providerPageSource.indexOf("if (secondBadge) card.append(secondBadge)");
  const providerActionsPosition = providerPageSource.indexOf('const actions = make("div", "card-actions provider-card-actions")');
  assert.ok(weBadgePosition >= 0 && weBadgePosition < weActionsPosition);
  assert.ok(providerBadgePosition >= 0 && providerBadgePosition < providerActionsPosition);
  assert.match(refinementCss, /\.source-badge-slot--second\s*\{\s*order:\s*0;/);
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
  assert.doesNotMatch(refinementCss, /grid-auto-rows:\s*1fr/);
  assert.match(componentsCss, /\.offer-card\s*\{\s*height:\s*auto;\s*min-height:\s*0;/);
  assert.doesNotMatch(refinementCss, /min-height:\s*340px/);
});

test("the WE package-card glow stays inside the card and cannot widen the document", () => {
  assert.match(refinementCss, /\.offer-card::before\s*\{\s*inset-inline-end:\s*0;/);
});
