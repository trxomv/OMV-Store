import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

function table(headers, rows = []) {
  const values = [headers, ...rows];
  return {
    getDataRange() {
      return {
        getValues: () => values,
        getFormulas: () => values.map((row) => row.map(() => "")),
      };
    },
  };
}

function makeHarness() {
  const mainWorkbook = new Map([
    ["Telecom Providers", table(["Provider_ID", "Provider_Name", "Spreadsheet_ID", "Enable"], [[2, "WE", "provider-id", true]])],
    ["Main Categories", table(["Category ID", "Category Name", "Enable"], [["routers", "All Routers", true]])],
    ["Website Settings", table(["Settings", "Value", "Enable"], [
      ["Show WE Page", "-", true],
      ["Show Offers Globally", "-", true],
      ["Auto Refresh Seconds", 20, true],
    ])],
    ["Social Media", table(["Contact ID", "Contact Type", "Value", "Target", "Enable"], [["whatsapp", "WhatsApp Number", "201234567890", "All", true]])],
    ["Payment Methods", table(["Payment Method", "Enable"], [["Payment_InstaPay", true]])],
    ["Announcements", table(["No.", "Target", "Value", "Enable"], [[1, "All", "إعلان عام للاختبار", true]])],
    ["Terms&Conditions", table(["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"])],
  ]);
  const providerWorkbook = new Map([
    ["Mobile_Rate Plans-Website", table(["No. of Plan", "MBs", "Minutes", "Main Price", "Increase", "Final Price", "Offer Price", "Show Offer", "Badge", "Show Rate Plan"], [[1, 10000, 1000, 100, 5, 105, 95, true, "", true]])],
    ["Page Settings", table(["Settings", "Enable"], [["Show Offers WE", true], ["Show WE Routers", true], ["Custom Rate Plans From 1", true]])],
    ["We-Terms&Conditions", table(["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"], [[1, "شرط اختبار", "General", true, 1]])],
    ["WE-Routers", table(["Router ID", "Router Name", "Price", "Increase", "FInal Price", "Discount Price", "Show Offer", "Enable", "Sort Order"])],
    ["WE-Routers_Details", table(["Router ID", "Section", "Titel", "Content", "Sort Order"])],
  ]);
  const requestedIds = [];
  const requestedSheets = [];
  const cacheValues = new Map();
  const cache = {
    get(key) { return cacheValues.get(key) || null; },
    put(key, value) { cacheValues.set(key, value); },
    remove(key) { cacheValues.delete(key); },
  };
  const context = vm.createContext({
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "OMV_MAIN_CONFIG_ID" ? "main-id" : "" }) },
    SpreadsheetApp: {
      openById(id) {
        requestedIds.push(id);
        const workbook = id === "main-id" ? mainWorkbook : id === "provider-id" ? providerWorkbook : null;
        if (!workbook) throw new Error("not accessible");
        return { getSheetByName(name) { requestedSheets.push(name); return workbook.get(name) || null; } };
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json", JAVASCRIPT: "application/javascript" },
      createTextOutput(text) {
        return { text, mimeType: "", setMimeType(value) { this.mimeType = value; return this; } };
      },
    },
    console: { error() {} },
  });
  vm.runInContext(source, context);
  return { context, requestedIds, requestedSheets };
}

function getJson(context, resource, extra = {}) {
  const output = context.doGet({ parameter: { resource, ...extra } });
  return { output, payload: JSON.parse(output.text) };
}

test("central API reads the provider workbook dynamically and returns safe site configuration", () => {
  const { context, requestedIds } = makeHarness();
  const { output, payload } = getJson(context, "site");
  assert.equal(output.mimeType, "application/json");
  assert.equal(payload.ok, true);
  assert.equal(payload.resource, "site");
  assert.equal(payload.refreshSeconds, 20);
  assert.equal(payload.providers.length, 1);
  assert.equal(payload.providers[0].id, 2);
  assert.equal(payload.providers[0].status, "available");
  assert.deepEqual(JSON.parse(JSON.stringify(payload.announcements)), [{ "No.": 1, Target: "All", Value: "إعلان عام للاختبار", Enable: true }]);
  assert.ok(requestedIds.includes("main-id"));
  assert.ok(requestedIds.includes("provider-id"));
  assert.doesNotMatch(JSON.stringify(payload), /main-id|provider-id|Spreadsheet_ID|spreadsheetId/);
});

test("provider resource preserves WE source tables and exposes only enabled sections", () => {
  const { context } = makeHarness();
  const { payload } = getJson(context, "provider", { id: "2" });
  assert.equal(payload.ok, true);
  assert.equal(payload.provider.id, 2);
  assert.equal(payload.pageEnabled, true);
  assert.equal(payload.pageSettings.offersEnabled, true);
  assert.equal(payload.sections.offers.enabled, true);
  assert.equal(payload.tables.standard.rows.length, 1);
  assert.equal(payload.we.ok, true);
  assert.equal(payload.we.sheets.standard.rows.length, 1);
  assert.equal(payload.sections.terms.rows[0].text, "شرط اختبار");
  assert.equal(payload.sections.routers.status, "empty");
});

test("router resource respects Main Categories and aggregates only valid enabled records", () => {
  const { context } = makeHarness();
  const { payload } = getJson(context, "routers");
  assert.equal(payload.ok, true);
  assert.equal(payload.sectionEnabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.routers)), []);
  assert.equal(payload.providers[0].providerId, 2);
  assert.equal(payload.providers[0].sectionEnabled, true);
});

test("unknown resources, bad provider IDs and unsafe JSONP callback names fail safely", () => {
  const { context } = makeHarness();
  assert.equal(getJson(context, "unknown").payload.errorCode, "unknown_resource");
  assert.equal(getJson(context, "provider", { id: "2.5" }).payload.ok, false);
  const unsafe = context.doGet({ parameter: { resource: "site", callback: "alert(1)" } });
  assert.equal(JSON.parse(unsafe.text).ok, true);
  const safe = context.doGet({ parameter: { resource: "site", callback: "omvCallback_1" } });
  assert.match(safe.text, /^omvCallback_1\(/);
  assert.equal(safe.mimeType, "application/javascript");
});

test("Apps Script source is read-only and excludes sheets or provider IDs from public properties", () => {
  assert.doesNotMatch(source, /function\s+doPost\s*\(/);
  assert.doesNotMatch(source, /\.setValue\s*\(|\.appendRow\s*\(|\.deleteRow\s*\(/);
  assert.match(source, /Spreadsheet_ID/);
  assert.match(source, /PropertiesService\.getScriptProperties\(\)\.getProperty\(MAIN_ID_PROPERTY_\)/);
  assert.match(source, /function\s+safeCallback_/);
  assert.match(source, /function\s+planSourceStatus_/);
  assert.match(source, /function\s+categoryIsEnabled_/);
  assert.match(source, /CacheService\.getScriptCache\(\)/);
});
