import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadResource } from "../public/js/data/multi-provider-client.js";
import {
  competitionPageState,
  competitionRoute,
  discountRateVisible,
  publicCompetitionRows,
  supportedCompetitionProvider,
} from "../public/js/data/provider-page-rules.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [providerPage, competitionsPage, competitionsJs, wePage, weApp, routeText, buildScript] = await Promise.all([
  read("public/js/provider-page.js"),
  read("public/competitions.html"),
  read("public/js/competitions-page.js"),
  read("public/we.html"),
  read("public/js/app.js"),
  read("public/manus-routes.json"),
  read("scripts/build.mjs"),
]);

function payload(providerId, rows = []) {
  return {
    provider: { providerId, enabled: true },
    pageEnabled: true,
    sections: { competitions: { enabled: true, status: rows.length ? "available" : "empty", rows } },
  };
}

test("discount percentage visibility follows the API boolean only for VF/ORA/ET and leaves WE unchanged", () => {
  for (const providerId of ["VF", "ORA", "ET"]) {
    assert.equal(discountRateVisible(providerId, { discountRateEnabled: true }), true);
    assert.equal(discountRateVisible(providerId, { discountRateEnabled: false }), false);
    assert.equal(discountRateVisible(providerId, {}), false);
    assert.equal(discountRateVisible(providerId, { discountRateEnabled: null }), false);
    assert.equal(discountRateVisible(providerId, { discountRateEnabled: "true" }), false);
  }
  assert.equal(discountRateVisible("TE", { discountRateEnabled: null }), true);
  assert.equal(discountRateVisible("unrecognized", { discountRateEnabled: true }), false);
  assert.match(providerPage, /discountRateVisible\(payload\.provider\?\.providerId \?\? payload\.provider\?\.id, payload\.pageSettings\)/);
  assert.match(providerPage, /if \(showDiscountRate && discount !== null/);
  assert.match(providerPage, /offerForPlan\(row, true\)/);
  assert.match(providerPage, /make\("del", "original-price"/);
  assert.match(providerPage, /make\("span", "current-price"/);
});

test("standalone competition routes accept only VF, ORA and ET and return each provider page", () => {
  assert.deepEqual(["VF", "ORA", "ET"].map(supportedCompetitionProvider), ["VF", "ORA", "ET"]);
  assert.equal(supportedCompetitionProvider("TE"), "");
  assert.equal(supportedCompetitionProvider("2"), "");
  assert.equal(supportedCompetitionProvider("other"), "");
  assert.deepEqual(["VF", "ORA", "ET"].map(competitionRoute), [
    "/competitions.html?provider=VF",
    "/competitions.html?provider=ORA",
    "/competitions.html?provider=ET",
  ]);
  assert.equal(competitionRoute("TE"), "");
  assert.match(competitionsJs, /if \(!requestedProvider\)/);
  assert.match(competitionsJs, /loadResource\("provider", legacyProviderId\(requestedProvider\)\)/);
});

test("competition links require enabled provider/page/section and eligible public rows", () => {
  const row = { competitionId: "c-1", title: "Public title", enabled: true, sortOrder: 4 };
  for (const providerId of ["VF", "ORA", "ET"]) {
    assert.equal(competitionPageState(payload(providerId, [row])), "available");
    assert.equal(publicCompetitionRows(payload(providerId, [row])).length, 1);
  }
  assert.match(providerPage, /payload\.pageEnabled === true/);
  assert.match(providerPage, /payload\.sections\?\.competitions\?\.enabled === true/);
  assert.match(providerPage, /publicCompetitionRows\(payload\)\.length > 0/);
  assert.match(providerPage, /competitionRoute\(providerId\)/);
});

test("competition display rejects disabled/incomplete data, retains API order, and allowlists public fields", () => {
  const first = { competitionId: "c-2", title: "Second in API order", enabled: true, sortOrder: 2, terms: "Public terms", participantName: "PRIVATE", phone: "01000000000", registration: { phone: "01000000001" } };
  const second = { competitionId: "c-1", title: "First by sort key", enabled: true, sortOrder: 1, giftDataGb: 3 };
  const rows = publicCompetitionRows(payload("VF", [first, second, { competitionId: "off", title: "Disabled", enabled: false }, { competitionId: "missing", title: "", enabled: true }, { competitionId: "", title: "No ID", enabled: true }]));
  assert.deepEqual(rows.map((row) => row.title), ["Second in API order", "First by sort key"]);
  assert.deepEqual(Object.keys(rows[0]), ["competitionId", "title", "benefitType", "giftDataGb", "giftDuration", "durationUnit", "startDate", "endDate", "terms", "sortOrder"]);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|01000000000|registration|phone/i);
  assert.equal(competitionPageState(payload("VF", [])), "empty");
});

test("competition display fails closed for disabled gates and preserves loading/empty/error UI", () => {
  const row = { competitionId: "c-1", title: "Public", enabled: true };
  assert.deepEqual(publicCompetitionRows({ ...payload("VF", [row]), pageEnabled: false }), []);
  assert.deepEqual(publicCompetitionRows({ ...payload("VF", [row]), provider: { providerId: "VF", enabled: false } }), []);
  assert.deepEqual(publicCompetitionRows({ ...payload("VF", [row]), sections: { competitions: { enabled: false, status: "disabled", rows: [row] } } }), []);
  assert.equal(competitionPageState({ ...payload("VF", []), sections: { competitions: { enabled: true, status: "unavailable", rows: [] } } }), "error");
  assert.match(competitionsPage, /aria-busy="true"/);
  assert.match(competitionsJs, /المسابقات غير مفعّلة/);
  assert.match(competitionsJs, /لا توجد مسابقات عامة مفعّلة/);
  assert.match(competitionsJs, /تعذر قراءة قائمة المسابقات/);
  assert.match(competitionsJs, /تعذر الاتصال بمصدر المسابقات/);
});

test("WE competitions stay on their existing page and competition route joins the static build manifest", () => {
  assert.match(wePage, /type="module" src="js\/app\.js"/);
  assert.match(weApp, /function readCompetitionRows\(\)/);
  assert.match(weApp, /payload\?\.competitions \?\? payload\?\.tables\?\.competitions \?\? payload\?\.sections\?\.competitions/);
  assert.doesNotMatch(wePage, /competitions\.html/);
  const routes = JSON.parse(routeText);
  assert.ok(routes.routes.some((route) => route.path === "/competitions.html"));
  assert.match(buildScript, /"competitions\.html"/);
  assert.match(buildScript, /"js\/competitions-page\.js"/);
});

test("provider client drops raw competition tables before returning or caching provider payloads", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const storage = new Map();
  const rawPayload = {
    ok: true,
    resource: "provider",
    provider: { providerId: "VF", enabled: true },
    pageEnabled: true,
    sections: { competitions: { enabled: true, rows: [{ competitionId: "c1", title: "Public", enabled: true }] } },
    we: { competitions: [{ Competition_Name: "WE Public", Description: "Public description", End_Date: "2026-12-31" }] },
    tables: {
      competitions: { status: "available", headers: ["Competition Title", "Participant_Name", "Phone", "Registration"], rows: [{ "Competition Title": "Public", Participant_Name: "PRIVATE", Phone: "01000000000", Registration: "secret" }] },
      standard: { status: "available", rows: [{ Plan_ID: "kept" }] },
    },
  };
  const cache = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };

  try {
    globalThis.window = {
      OMV_SITE_CONFIG: { centralApiEndpoint: "https://script.google.com/macros/s/test-id/exec" },
      localStorage: cache,
      setTimeout() { return 1; },
      clearTimeout() {},
    };
    globalThis.document = {
      baseURI: "https://omv.example/",
      createElement() { return { remove() {} }; },
      head: { append(script) {
        const callback = new URL(script.src).searchParams.get("callback");
        globalThis.window[callback](rawPayload);
      } },
    };

    const fresh = await loadResource("provider", "VF");
    assert.equal(fresh.payload.tables.competitions, undefined);
    assert.equal(fresh.payload.sections.competitions.rows[0].title, "Public");
    assert.equal(fresh.payload.we.competitions[0].Competition_Name, "WE Public");
    assert.equal(fresh.payload.tables.standard.rows[0].Plan_ID, "kept");
    const freshCache = JSON.parse(storage.get("omv:v2:provider:VF"));
    assert.equal(freshCache.payload.tables.competitions, undefined);
    assert.match(JSON.stringify(rawPayload), /PRIVATE|01000000000|Registration/);

    storage.set("omv:v2:provider:TE", JSON.stringify({ savedAt: 1, payload: { ...rawPayload, provider: { providerId: "TE", enabled: true } } }));
    globalThis.document.head.append = (script) => script.onerror();
    const cached = await loadResource("provider", "TE");
    assert.equal(cached.sourceMode, "cache");
    assert.equal(cached.payload.tables.competitions, undefined);
    const cleanedCache = JSON.parse(storage.get("omv:v2:provider:TE"));
    assert.equal(cleanedCache.payload.tables.competitions, undefined);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
