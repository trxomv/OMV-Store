import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(new URL("../apps-script/provider-adapters.gs", import.meta.url), "utf8"))
  + "\n"
  + (await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8"));

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

function makeHarness(options = {}) {
  const providerId = options.providerId ?? "TE";
  const providers = {
    VF: { id: 1, name: "Vodafone", slug: "vodafone", sheets: { home: "@Home_Rate_Plans", routers: "VF-Routers", details: "VF-Routers_Details", settings: "VF-Page Settings", terms: "VF-Terms&Conditions", competitions: "VF-Competitions" } },
    TE: { id: 2, name: "WE", slug: "we", sheets: { home: "TE-Air_Rate_Plans", routers: "TE-Routers", details: "TE-Routers_Details", settings: "TE-Page Settings", terms: "TE-Terms&Conditions", competitions: "TE-Competitions" } },
    ORA: { id: 3, name: "Orange", slug: "orange", sheets: { home: "Home_Wir_Rate_Plans", routers: "ORA-Routers", details: "ORA-Routers_Details", settings: "ORA-Page Settings", terms: "ORA-Terms&Conditions", competitions: "ORA-Competitions" } },
    ET: { id: 4, name: "Etisalat", slug: "etisalat", sheets: { home: "eHome_Rate_Plans", routers: "ET-Routers", details: "ET-Routers_Details", settings: "ET-Page Settings", terms: "Etisalat-Terms&Conditions", competitions: "ET-Competitions" } },
  }[providerId];
  const sourceId = providerId === "TE" ? "provider-id" : `provider-${providerId}`;
  const mainPageKey = `Show ${providers.name} Page`;
  const localSettings = providerId === "TE"
    ? [["Show Offers WE", options.offersEnabled ?? true], ["Show WE Routers", options.routersEnabled ?? true], ["Show to EOM", options.showEom ?? true], ["Show to 15", options.showTo15 ?? true], ["Custom Rate Plans From 1", true], ["Custom Rate Plans From 16", true], ["Show WE Competitions", options.competitionsEnabled ?? true]]
    : [[mainPageKey, options.providerPageEnabled ?? true], [`Show ${providers.name} Offers`, options.offersEnabled ?? true], ...(options.omitDiscountRate ? [] : [["Show Discount Rate", options.discountRateEnableValue ?? options.discountRateEnabled ?? true]]), [`Show ${providers.name} Routers`, options.routersEnabled ?? true], [`Show ${providers.name} Competitions`, options.competitionsEnabled ?? true]];
  const mainWorkbook = new Map([
    ["Telecom Providers", table(["Provider_ID", "Provider_Name", "Spreadsheet_ID", "Enable"], [[providers.id, providers.name, sourceId, true]])],
    ["Main Categories", table(["Sort Order", "Category ID", "Category Name", "Enable"], [[1, "routers", "All Routers", true]])],
    ["Website Settings", table(["Settings", "Value", "Enable"], [
      [mainPageKey, true, options.mainPageEnabled ?? true],
      ["Show Offers Globally", "--", true],
      ["Auto Refresh Seconds", 20, true],
    ])],
    ["Social Media", table(["Sort Order", "Contact ID", "Contact Type", "Value", "Target", "Enable"], [[1, "whatsapp", "WhatsApp Number", "201234567890", "All", true]])],
    ["Payment Methods", table(["Payment Method", "Enable"], [["Payment_InstaPay", true]])],
    ["Announcements", table(["No.", "Target", "Value", "Enable"], [[1, "All", "إعلان عام للاختبار", true]])],
    ["Terms&Conditions", table(["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"])],
  ]);
  if (options.approvedRefresh) mainWorkbook.set("Website Settings", table(["Settings", "Value", "Enable"], [
    ["Auto Data Refresh", true, true],
    ["Competitions Change Check (Seconds)", 5, true],
    ["General Data Change Check (Seconds)", 15, true]
  ]));
  mainWorkbook.set("OMV-Terms&Conditions", table(["Term_ID", "Term_Titel", "Term_Text", "Term_Type", "Enable", "Display_Order"], [[1, "عنوان اختبار", "شرط اختبار", "General", true, 1]]));
  mainWorkbook.set("Router Offers", table(["Offer_ID", "Router_ID", "Enable"], [["offer-1", "r1", true]]));
  mainWorkbook.set("Master_Plans", table(["Plan_ID", "Enable"], [["master-1", true]]));

  const standardHeaders = ["Plan_ID", "Plan-Name", "MBs", "Minutes", "Main Price", "Increase", "Final Price", "Offer Price", "Show Offer", "First Badge", "Second Badge", "Show Rate Plan"];
  const homeHeaders = ["Plan_ID", "Plan-Name", "GBs", "Main Price", "Increase", "Final Price", "Offer Price", "Show Offer", "First Badge", "Second Badge", "Show Rate Plan"];
  const routerHeaders = ["Router ID", "Router Name", "Price", "Increase", "FInal Price", "Discount Price", "Show Offer", "First Badge", "Second Badge", "Show Router", "Sort Order"];
  const competitionHeaders = ["Competition ID", "Competition Title", "Benefit_Type", "Gift_Data_GB", "Gift_Duration", "Duration_Unit", "Start_Date", "End_Date", "Terms", "Sort_Order", "Enable"];
  const providerWorkbook = new Map([
    ["Mobile_Rate_Plans", table(standardHeaders, [[1, "Mobile Plan", 10000, 1000, 100, 5, 105, 95, false, "", "", true]])],
    [providers.sheets.home, table(homeHeaders, [[2, "Home Plan", 30, 100, 5, 105, 95, false, "", "", true]])],
    [providers.sheets.settings, table(["Settings", "Enable"], localSettings)],
    [providers.sheets.terms, table(["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"], [[1, "شرط اختبار", "General", true, 1]])],
    [providers.sheets.routers, table(routerHeaders, options.includeRouter ? [["r1", "Source Router", 90, 10, 100, 95, options.routerOfferEnabled ?? false, "", "", options.routerEnabled ?? true, 1]] : [])],
    [providers.sheets.details, table(["Router ID", "Section", "Titel", "Content", "Sort Order"])],
    [providers.sheets.competitions, table(competitionHeaders, [["c1", "Competition", "Data", 2, 7, "days", "2026-10-01", "2026-10-31", "Public terms", 1, true]])],
  ]);
  if (providerId === "TE") {
    providerWorkbook.set("Mobile_Plans_2_EOM", table(["Plan_ID", "Plan-Name", "MBs", "Minutes", "Main Price", "Increase", "Final Price", "Tha Actual Days Left", "Days Left", "Show"], [[3, "EOM Plan", 5000, 500, 80, 0, 80, 10, 10, options.showEom ?? true]]));
    providerWorkbook.set("Mobile_Plans_2_15", table(["Plan_ID", "Plan-Name", "MBs", "Minutes", "Main Price", "Increase", "Final Price", "Tha Actual Days Left", "Days Left", "Show"], [[4, "15 Plan", 6000, 600, 90, 0, 90, 10, 10, options.showTo15 ?? true]]));
    providerWorkbook.set("Custom Pricing", table(["Rule", "Type", "GB From", "GB To", "Minutes From", "Minutes To", "GB Price", "Minute Price", "Enabled"]));
    providerWorkbook.set("Add-on", table(["Bundle", "Quota", "Price"]));
  }
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
        const workbook = id === "main-id" ? mainWorkbook : id === sourceId ? providerWorkbook : null;
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
  return { context, requestedIds, requestedSheets, sourceId, mainWorkbook, providerWorkbook };
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
  assert.equal(payload.refreshSeconds, 0);
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
  assert.equal(payload.providers[0].providerId, "TE");
  assert.equal(payload.providers[0].id, 2);
  assert.equal(payload.providers[0].sectionEnabled, true);
});

test("all four providers use actual local setting keys, source tabs, and enabled public competitions", () => {
  const names = { VF: "Vodafone", TE: "WE", ORA: "Orange", ET: "Etisalat" };
  for (const providerId of ["VF", "TE", "ORA", "ET"]) {
    const { context } = makeHarness({ providerId, mainPageEnabled: true, providerPageEnabled: true, includeRouter: true, routerEnabled: true, routerOfferEnabled: false });
    const site = getJson(context, "site").payload;
    const summary = site.providers[0];
    assert.equal(summary.providerId, providerId);
    assert.equal(summary.pageEnabled, true);
    assert.equal(summary.offersEnabled, true);
    assert.equal(summary.routersEnabled, true);
    assert.equal(summary.competitionsEnabled, true);
    const provider = getJson(context, "provider", { id: providerId }).payload;
    assert.equal(provider.pageEnabled, true);
    assert.equal(provider.pageSettings.offersEnabled, true);
    assert.equal(provider.pageSettings.routersEnabled, true);
    assert.equal(provider.sections.offers.enabled, true);
    assert.equal(provider.sections.routers.enabled, true);
    assert.equal(provider.sections.routers.rows.length, 1);
    assert.equal(provider.sections.routers.rows[0].visibility.router, true);
    assert.equal(provider.sections.routers.rows[0].visibility.deviceOffer, false);
    assert.equal(provider.sections.competitions.enabled, true);
    assert.equal(provider.sections.competitions.rows.length, 1);
    assert.equal(provider.sections.competitions.rows[0].title, "Competition");
    assert.equal(provider.tables.competitions.status, "available");
    assert.equal(provider.tables.standard.headers.includes("Plan_ID"), true);
    assert.equal(provider.diagnostics.some((item) => /spreadsheet|participant|secret/i.test(JSON.stringify(item))), false);
    assert.equal(provider.provider.name, names[providerId]);
    if (providerId === "TE") {
      assert.equal(provider.tables.eom.status, "available");
      assert.equal(provider.tables.to15.status, "available");
      assert.equal(provider.we.sheets.eom.rows[0].Show, true);
      assert.equal(provider.we.sheets.to15.rows[0].Show, true);
      assert.equal(provider.we.sheets.settings.rows.find((row) => row.Settings === "Show Plans to EOM").Value, true);
      assert.equal(provider.we.sheets.settings.rows.find((row) => row.Settings === "Show Plans to 15").Value, true);
      assert.equal(provider.we.competitions.length, 1);
    }
  }
});

test("discount-rate API field follows each VF/ORA/ET Page Settings Enable cell and fails closed", () => {
  for (const providerId of ["VF", "ORA", "ET"]) {
    const enabled = getJson(makeHarness({ providerId, discountRateEnabled: true }).context, "provider", { id: providerId }).payload;
    const disabled = getJson(makeHarness({ providerId, discountRateEnabled: false }).context, "provider", { id: providerId }).payload;
    const missing = getJson(makeHarness({ providerId, omitDiscountRate: true }).context, "provider", { id: providerId }).payload;
    const invalid = getJson(makeHarness({ providerId, discountRateEnableValue: "perhaps" }).context, "provider", { id: providerId }).payload;
    assert.equal(enabled.pageSettings.discountRateEnabled, true);
    assert.equal(disabled.pageSettings.discountRateEnabled, false);
    assert.equal(missing.pageSettings.discountRateEnabled, null);
    assert.equal(invalid.pageSettings.discountRateEnabled, null);
    assert.ok(missing.diagnostics.some((item) => item.code === "SETTING_MISSING" && item.setting === "Show Discount Rate"));
    assert.ok(invalid.diagnostics.some((item) => item.code === "SETTING_INVALID_BOOLEAN" && item.setting === "Show Discount Rate"));

    const harness = makeHarness({ providerId, discountRateEnabled: false });
    const sheetName = harness.context.logicalWorksheet_(providerId, "providerSettings").physicalWorksheet;
    const sourceRows = harness.providerWorkbook.get(sheetName).getDataRange().getValues().slice(1);
    const rowsWithConflictingValue = sourceRows.map(([setting, enable]) => [setting, setting === "Show Discount Rate", setting === "Show Discount Rate" ? false : enable]);
    harness.providerWorkbook.set(sheetName, table(["Settings", "Value", "Enable"], rowsWithConflictingValue));
    const enableWins = getJson(harness.context, "provider", { id: providerId }).payload;
    assert.equal(enableWins.pageSettings.discountRateEnabled, false, `${providerId} must follow Enable rather than Value`);
  }
  const we = getJson(makeHarness({ providerId: "TE" }).context, "provider", { id: "TE" }).payload;
  assert.equal(we.pageSettings.discountRateEnabled, null);
  assert.equal(we.diagnostics.some((item) => item.setting === "Show Discount Rate"), false);
});

test("provider and main page switches combine, while WE uses its real main switch and has no invented local page setting", () => {
  const mainDisabled = getJson(makeHarness({ providerId: "VF", mainPageEnabled: false }).context, "provider", { id: "VF" }).payload;
  assert.equal(mainDisabled.pageSettings.mainPageEnabled, false);
  assert.equal(mainDisabled.pageSettings.providerPageEnabled, true);
  assert.equal(mainDisabled.pageEnabled, false);
  assert.equal(mainDisabled.sections.offers.enabled, false);
  assert.equal(mainDisabled.sections.routers.enabled, false);

  const providerDisabled = getJson(makeHarness({ providerId: "ORA", mainPageEnabled: true, providerPageEnabled: false }).context, "provider", { id: "ORA" }).payload;
  assert.equal(providerDisabled.pageSettings.mainPageEnabled, true);
  assert.equal(providerDisabled.pageSettings.providerPageEnabled, false);
  assert.equal(providerDisabled.pageEnabled, false);

  const we = getJson(makeHarness({ providerId: "TE", mainPageEnabled: false }).context, "provider", { id: "TE" }).payload;
  assert.equal(we.pageEnabled, false);
  assert.equal(we.pageSettings.providerPageEnabled, null);
  assert.equal(we.diagnostics.some((item) => item.setting === "Show WE Page"), false);
});

test("provider page switches independently gate offers, router visibility, device offers, and competitions", () => {
  const { context } = makeHarness({ providerId: "ET", includeRouter: true, routersEnabled: true, routerEnabled: true, routerOfferEnabled: false, offersEnabled: false, competitionsEnabled: false });
  const payload = getJson(context, "provider", { id: "ET" }).payload;
  assert.equal(payload.sections.offers.enabled, false);
  assert.equal(payload.sections.routers.enabled, true);
  assert.equal(payload.sections.routers.rows.length, 1);
  assert.equal(payload.sections.routers.rows[0].showOffer, false);
  assert.equal(payload.sections.competitions.enabled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.sections.competitions.rows)), []);

  const hiddenRouter = getJson(makeHarness({ providerId: "TE", includeRouter: true, routersEnabled: true, routerEnabled: false }).context, "provider", { id: "TE" }).payload;
  assert.equal(hiddenRouter.sections.routers.enabled, true);
  assert.equal(hiddenRouter.sections.routers.rows.length, 0);
});

test("VF/ORA/ET competitions preserve public order, exclude disabled/incomplete rows, and expose no participant fields", () => {
  for (const providerId of ["VF", "ORA", "ET"]) {
    const enabled = getJson(makeHarness({ providerId, competitionsEnabled: true }).context, "provider", { id: providerId }).payload;
    const disabled = getJson(makeHarness({ providerId, competitionsEnabled: false }).context, "provider", { id: providerId }).payload;
    assert.equal(enabled.sections.competitions.enabled, true);
    assert.equal(enabled.sections.competitions.rows.length, 1);
    assert.equal(disabled.sections.competitions.enabled, false);
    assert.deepEqual(JSON.parse(JSON.stringify(disabled.sections.competitions.rows)), []);
  }

  const { context } = makeHarness({ providerId: "VF" });
  const normalized = context.normalizeCompetitions_({ status: "available", rows: [
    { "Competition ID": "later", "Competition Title": "Second", Enable: true, Sort_Order: 20, Participant_Name: "PRIVATE", Phone: "01000000000" },
    { "Competition ID": "off", "Competition Title": "Disabled", Enable: false, Sort_Order: 1 },
    { "Competition ID": "missing-title", "Competition Title": "", Enable: true, Sort_Order: 2 },
    { "Competition ID": "", "Competition Title": "Incomplete", Enable: true, Sort_Order: 3 },
    { "Competition ID": "first", "Competition Title": "First", Enable: true, Sort_Order: 10 }
  ] }, true);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.rows.map((row) => row.competitionId))), ["first", "later"]);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.rows.map((row) => row.sortOrder))), [10, 20]);
  assert.doesNotMatch(JSON.stringify(normalized), /Participant_Name|PRIVATE|01000000000/);
});

test("provider API competition table keeps only approved source columns even when the sheet has private fields", () => {
  for (const providerId of ["VF", "TE", "ORA", "ET"]) {
    const harness = makeHarness({ providerId });
    const sheetName = harness.context.logicalWorksheet_(providerId, "competitions").physicalWorksheet;
    const existing = harness.providerWorkbook.get(sheetName).getDataRange().getValues();
    const publicHeaders = existing[0];
    harness.providerWorkbook.set(sheetName, table(
      [...publicHeaders, "Participant_Name", "Phone", "Registration", "Private_Entry"],
      [[...existing[1], "PRIVATE_PERSON", "01000000000", "registration-secret", "private-entry-secret"]],
    ));

    const payload = getJson(harness.context, "provider", { id: providerId }).payload;
    assert.deepEqual(JSON.parse(JSON.stringify(payload.tables.competitions.headers)), publicHeaders);
    assert.equal(payload.tables.competitions.rows.length, 1);
    assert.equal(payload.tables.competitions.rows[0].Participant_Name, undefined);
    assert.equal(payload.sections.competitions.rows.length, 1);
    if (providerId === "TE") assert.equal(payload.we.competitions[0].Competition_Name, "Competition");
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_PERSON|01000000000|registration-secret|private-entry-secret|Participant_Name|Private_Entry/);
  }
});

test("WE EOM and day-15 switches are forwarded independently and malformed settings produce sanitized diagnostics", () => {
  const { context } = makeHarness({ providerId: "TE", showEom: false, showTo15: true });
  const payload = getJson(context, "provider", { id: "TE" }).payload;
  assert.equal(payload.we.sheets.settings.rows.find((row) => row.Settings === "Show Plans to EOM").Value, false);
  assert.equal(payload.we.sheets.settings.rows.find((row) => row.Settings === "Show Plans to 15").Value, true);
  assert.equal(payload.tables.eom.rows[0].Show, false);
  assert.equal(payload.tables.to15.rows[0].Show, true);

  const { context: invalidContext, providerWorkbook } = makeHarness({ providerId: "VF" });
  const settingsSheet = invalidContext.logicalWorksheet_("VF", "providerSettings").physicalWorksheet;
  providerWorkbook.set(settingsSheet, table(["Settings", "Enable"], [["Show Vodafone Page", true], ["Show Vodafone Offers", "maybe"], ["Show Discount Rate", true], ["Show Vodafone Routers", true], ["Show Vodafone Competitions", true]]));
  const invalidPayload = getJson(invalidContext, "provider", { id: "VF" }).payload;
  assert.equal(invalidPayload.pageSettings.offersEnabled, false);
  assert.ok(invalidPayload.diagnostics.some((item) => item.code === "SETTING_INVALID_BOOLEAN" && item.setting === "Show Vodafone Offers"));
  assert.equal(invalidPayload.diagnostics.every((item) => !Object.prototype.hasOwnProperty.call(item, "value")), true);
  const { context: dataContext, providerWorkbook: dataWorkbook } = makeHarness({ providerId: "VF" });
  const standardSheet = dataContext.logicalWorksheet_("VF", "standard").physicalWorksheet;
  dataWorkbook.set(standardSheet, table(["Plan_ID", "Plan-Name", "MBs", "Minutes", "Main Price", "Increase", "Final Price", "Offer Price", "Show Offer", "First Badge", "Second Badge", "Show Rate Plan"], [["", "Broken", 1000, 100, 10, 0, "bad price", "", false, "", "", true]]));
  const dataDiagnostics = getJson(dataContext, "provider", { id: "VF" }).payload.diagnostics;
  assert.ok(dataDiagnostics.some((item) => item.code === "MISSING_IDENTIFIER" && item.resource === "standard" && item.count === 1));
  assert.ok(dataDiagnostics.some((item) => item.code === "INVALID_PRICE" && item.resource === "standard" && item.count === 1));
  assert.equal(dataDiagnostics.every((item) => !Object.prototype.hasOwnProperty.call(item, "value")), true);
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
  const { context } = makeHarness();
  assert.equal(context.MAIN_ID_PROPERTY_, "OMV_MAIN_CONFIG_ID");
  assert.match(source, /PropertiesService\.getScriptProperties\(\)\.getProperty\(MAIN_ID_PROPERTY_\)/);
  assert.match(source, /function\s+safeCallback_/);
  assert.match(source, /function\s+planSourceStatus_/);
  assert.match(source, /function\s+categoryIsEnabled_/);
  assert.match(source, /CacheService\.getScriptCache\(\)/);
});

test("canonical provider registry resolves IDs and legacy routes without guessing unknown values", () => {
  const { context } = makeHarness();
  assert.equal(context.getCanonicalProviderId_("VF"), "VF");
  assert.equal(context.getCanonicalProviderId_("TE"), "TE");
  assert.equal(context.getCanonicalProviderId_("2"), "TE");
  assert.equal(context.getCanonicalProviderId_(2), "TE");
  assert.equal(context.getCanonicalProviderId_("ORA"), "ORA");
  assert.equal(context.getCanonicalProviderId_("ET"), "ET");
  assert.equal(context.getCanonicalProviderId_("unknown"), "");
  assert.equal(context.getCanonicalProviderId_({}), "");
});

test("approved provider worksheet mappings are explicit and provider-specific", () => {
  const { context } = makeHarness();
  assert.equal(context.logicalWorksheet_("VF", "routers").physicalWorksheet, "VF-Routers");
  assert.equal(context.logicalWorksheet_("TE", "routers").physicalWorksheet, "TE-Routers");
  assert.equal(context.logicalWorksheet_("ORA", "routers").physicalWorksheet, "ORA-Routers");
  assert.equal(context.logicalWorksheet_("ET", "routers").physicalWorksheet, "ET-Routers");
  assert.equal(context.logicalWorksheet_("TE", "providerSettings").physicalWorksheet, "TE-Page Settings");
  assert.equal(context.logicalMainWorksheet_("routerOffers").physicalWorksheet, "Router Offers");
  assert.equal(context.COMPETITION_ENTRIES_MAPPING_.worksheet, "Competition Entries");
  assert.equal(context.logicalWorksheet_("NOPE", "routers").error.code, "UNKNOWN_PROVIDER");
});

test("header validation distinguishes missing and duplicate headers", () => {
  const { context } = makeHarness();
  assert.equal(context.validateHeaders_({ headers: ["Plan_ID", " Final Price "] }, ["Plan_ID", "Final Price"], []).ok, true);
  assert.equal(context.validateHeaders_({ headers: ["Plan_ID"] }, ["Plan_ID", "Final Price"], []).code, "UNSUPPORTED_SCHEMA");
  assert.equal(context.validateHeaders_({ headers: ["Plan_ID", "Plan ID"] }, ["Plan_ID"], []).code, "UNSUPPORTED_SCHEMA");
  assert.equal(context.validateHeaders_({ headers: ["Plan_ID"] }, ["Plan_ID"], ["Show Offer"]).ok, true);
});

test("refresh configuration supports approved aliases, enable flags, and conflicts", () => {
  const { context } = makeHarness();
  const config = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: "TRUE", Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] });
  assert.equal(config.autoDataRefresh, true);
  assert.equal(config.competitionChangeCheckSeconds, 5);
  assert.equal(config.generalDataChangeCheckSeconds, 15);
  assert.equal(config.conflicts.length, 0);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Data Refresh", Value: "FALSE", Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] }), 0);
  const singular = context.readRefreshConfiguration_({ rows: [{ Settings: "Competition Change Check (Seconds)", Value: 7, Enable: true }] });
  assert.equal(singular.competitionChangeCheckSeconds, 7);
  const conflict = context.readRefreshConfiguration_({ rows: [
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "Competition Change Check (Seconds)", Value: 7, Enable: true }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(conflict.conflicts)), ["competitionChangeCheckSeconds"]);
  assert.equal(context.readRefreshConfiguration_({ rows: [{ Settings: "General Data Change Check (Seconds)", Value: 0, Enable: true }] }).generalDataChangeCheckSeconds, null);
});

test("plural competition refresh alias wins by selected row regardless of row order", () => {
  const { context } = makeHarness();
  const pluralFirst = context.readRefreshConfiguration_({ rows: [
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "Competition Change Check (Seconds)", Value: 10, Enable: false }
  ] });
  const singularFirst = context.readRefreshConfiguration_({ rows: [
    { Settings: "Competition Change Check (Seconds)", Value: 10, Enable: false },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true }
  ] });
  assert.equal(pluralFirst.competitionChangeCheckSeconds, 5);
  assert.equal(pluralFirst.enabled.competitionChangeCheckSeconds, true);
  assert.equal(singularFirst.competitionChangeCheckSeconds, 5);
  assert.equal(singularFirst.enabled.competitionChangeCheckSeconds, true);
  assert.deepEqual(JSON.parse(JSON.stringify(singularFirst.conflicts)), ["competitionChangeCheckSeconds"]);
  const matching = context.readRefreshConfiguration_({ rows: [
    { Settings: "Competition Change Check (Seconds)", Value: 5, Enable: false },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true }
  ] });
  assert.equal(matching.competitionChangeCheckSeconds, 5);
  assert.equal(matching.enabled.competitionChangeCheckSeconds, true);
  assert.deepEqual(JSON.parse(JSON.stringify(matching.conflicts)), []);
  const singularOnly = context.readRefreshConfiguration_({ rows: [{ Settings: "Competition Change Check (Seconds)", Value: 7, Enable: true }] });
  assert.equal(singularOnly.competitionChangeCheckSeconds, 7);
  assert.equal(context.readRefreshConfiguration_({ rows: [] }).competitionChangeCheckSeconds, null);
});

test("router visibility remains independent from device-offer visibility", () => {
  const { context } = makeHarness();
  const result = context.normalizeRouters_({ status: "available", rows: [{ "Router ID": "r1", "Router Name": "Router", "FInal Price": 100, "Show Router": true, "Show Offer": false }] }, { rows: [] }, { providerId: "VF", id: 1, name: "Vodafone", slug: "vodafone" }, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].visibility.router, true);
  assert.equal(result.rows[0].visibility.deviceOffer, false);
  const we = context.normalizeRouters_({ status: "available", rows: [{ "Router ID": "r2", "Router Name": "WE Router", "FInal Price": 100, "Show Router": true, "Show Offer": false }] }, { rows: [] }, { providerId: "TE", id: 2, name: "WE", slug: "we" }, true);
  assert.equal(we.rows.length, 1);
  assert.equal(we.rows[0].visibility.router, true);
  assert.equal(we.rows[0].visibility.deviceOffer, false);
  const obsolete = context.normalizeRouters_({ status: "available", rows: [{ "Router ID": "r3", "Router Name": "Wrong Header", "FInal Price": 100, Enable: true, "Show Offer": true }] }, { rows: [] }, { providerId: "TE", id: 2, name: "WE", slug: "we" }, true);
  assert.equal(obsolete.rows.length, 0);
});

test("Egyptian phone normalization is isolated and canonical", () => {
  const { context } = makeHarness();
  for (const value of ["01012345678", "201012345678", "+201012345678", "00201012345678"]) {
    assert.equal(context.normalizeEgyptianMobile_(value).value, "201012345678");
  }
  for (const value of ["", null, "0101234567", "01612345678", "02212345678", "+12025550123", "abc01012345678"]) {
    assert.equal(context.normalizeEgyptianMobile_(value).ok, false);
  }
});

test("real main resource loading uses approved terms, Router Offers, and Master_Plans mappings", () => {
  const { context, requestedSheets } = makeHarness();
  const main = context.getMainConfig_();
  assert.equal(main.terms.sheetName, "OMV-Terms&Conditions");
  assert.equal(main.terms.rows[0].Term_Titel, "عنوان اختبار");
  assert.equal(main.routerOffers.sheetName, "Router Offers");
  assert.equal(main.masterPlans.sheetName, "Master_Plans");
  assert.ok(requestedSheets.includes("OMV-Terms&Conditions"));
  assert.ok(requestedSheets.includes("Router Offers"));
  assert.ok(requestedSheets.includes("Master_Plans"));
});

test("real provider resource loading requests the mapped home-plan worksheet", () => {
  const { context } = makeHarness();
  const payload = getJson(context, "provider", { id: "2" }).payload;
  assert.equal(payload.tables.home.sheetName, "TE-Air_Rate_Plans");
  assert.equal(payload.tables.home.rows.length, 1);
  assert.equal(payload.provider.providerId, "TE");
  assert.equal(payload.provider.id, 2);
});

test("home-plan adapters resolve all four approved physical worksheets through mapped reads", () => {
  const { context } = makeHarness();
  const expected = { VF: "@Home_Rate_Plans", TE: "TE-Air_Rate_Plans", ORA: "Home_Wir_Rate_Plans", ET: "eHome_Rate_Plans" };
  Object.keys(expected).forEach((providerId) => {
    const workbook = { getSheetByName(name) {
      return name === expected[providerId] ? table(["Plan_ID", "Plan-Name", "GBs", "Final Price", "Show Rate Plan"], [["home-1", "Home", 10, 50, true]]) : null;
    } };
    const result = context.readMappedTable_(workbook, providerId, "home");
    assert.equal(result.sheetName, expected[providerId]);
    assert.equal(result.status, "available");
  });
});

test("mapped reads apply diagnostics while preserving optional headers and missing optional sheets", () => {
  const { context } = makeHarness();
  const invalid = { getSheetByName() { return table(["Router ID", "Router Name", "Router ID"], [["r1", "Router", "duplicate"]]); } };
  const invalidResult = context.readMappedTable_(invalid, "VF", "routers");
  assert.equal(invalidResult.errorCode, "UNSUPPORTED_SCHEMA");
  assert.ok(invalidResult.schema.duplicate.length > 0);
  const missing = { getSheetByName() { return null; } };
  assert.equal(context.readMappedTable_(missing, "VF", "home").errorCode, "MISSING_WORKSHEET");
});

test("effective refresh state keeps intervals independent and disables both under the global switch", () => {
  const { context } = makeHarness();
  const enabled = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(enabled.effective)), { autoDataRefresh: true, competitionChangeCheckSeconds: 5, generalDataChangeCheckSeconds: 15 });
  const competitionDisabled = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: false },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] });
  assert.equal(competitionDisabled.effective.competitionChangeCheckSeconds, null);
  assert.equal(competitionDisabled.effective.generalDataChangeCheckSeconds, 15);
  const globalDisabled = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: false, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] });
  assert.equal(globalDisabled.effective.autoDataRefresh, false);
  assert.equal(globalDisabled.effective.competitionChangeCheckSeconds, null);
  assert.equal(globalDisabled.effective.generalDataChangeCheckSeconds, null);
  const globalEnableDisabled = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: false },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] });
  assert.equal(globalEnableDisabled.effective.autoDataRefresh, false);
  const bothIntervalsDisabled = context.readRefreshConfiguration_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: false },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: false }
  ] });
  assert.equal(bothIntervalsDisabled.effective.competitionChangeCheckSeconds, null);
  assert.equal(bothIntervalsDisabled.effective.generalDataChangeCheckSeconds, null);
  const missingGlobal = context.readRefreshConfiguration_({ rows: [{ Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }] });
  assert.equal(missingGlobal.effective.autoDataRefresh, false);
  assert.equal(missingGlobal.effective.generalDataChangeCheckSeconds, null);
});

test("site API exposes effective refresh state without removing the legacy refreshSeconds field", () => {
  const { context } = makeHarness({ approvedRefresh: true });
  const { payload } = getJson(context, "site");
  assert.equal(payload.refreshSeconds, 15);
  assert.equal(payload.refreshConfiguration.effective.autoDataRefresh, true);
  assert.equal(payload.refreshConfiguration.effective.competitionChangeCheckSeconds, 5);
  assert.equal(payload.refreshConfiguration.effective.generalDataChangeCheckSeconds, 15);
});

test("public settings flags do not contradict effective refresh state", () => {
  const { context } = makeHarness();
  const disabledByValue = context.publicWebsiteSettings_({ status: "available", rows: [
    { Settings: "Auto Data Refresh", Value: false, Enable: true }
  ] }, 0);
  assert.equal(disabledByValue.flags["Auto Data Refresh"], false);
  assert.equal(disabledByValue.administrativeFlags["Auto Data Refresh"], true);
  assert.equal(disabledByValue.configuredValues["Auto Data Refresh"], false);
  const disabledByEnable = context.publicWebsiteSettings_({ status: "available", rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: false }
  ] }, 0);
  assert.equal(disabledByEnable.flags["Auto Data Refresh"], false);
  assert.equal(disabledByEnable.administrativeFlags["Auto Data Refresh"], false);
  const enabled = context.publicWebsiteSettings_({ status: "available", rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true }
  ] }, 0);
  assert.equal(enabled.flags["Auto Data Refresh"], true);
  assert.equal(enabled.effectiveRefresh.autoDataRefresh, true);
});

test("canonical global refresh setting is required and legacy fallback cannot activate polling", () => {
  const { context } = makeHarness();
  assert.equal(context.getRefreshSeconds_({ rows: [] }), 0);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Refresh Seconds", Value: 60, Enable: true }
  ] }), 0);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Data Refresh", Value: false, Enable: true },
    { Settings: "Auto Refresh Seconds", Value: 60, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] }), 0);
});

test("canonical global refresh enables v1 refreshSeconds only through the effective general interval", () => {
  const { context } = makeHarness();
  const enabled = { rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: true }
  ] };
  assert.equal(context.getRefreshSeconds_(enabled), 15);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: 15, Enable: false },
    { Settings: "Auto Refresh Seconds", Value: 60, Enable: true }
  ] }), 0);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true }
  ] }), 0);
  assert.equal(context.getRefreshSeconds_({ rows: [
    { Settings: "Auto Data Refresh", Value: true, Enable: true },
    { Settings: "Competitions Change Check (Seconds)", Value: 5, Enable: true },
    { Settings: "General Data Change Check (Seconds)", Value: "invalid", Enable: true }
  ] }), 0);
});

test("provider records and summaries expose canonical IDs for all four providers", () => {
  const { context } = makeHarness();
  const records = context.providerRecords_({ rows: [
    { Provider_ID: "VF", Provider_Name: "Vodafone", Spreadsheet_ID: "", Enable: true },
    { Provider_ID: "TE", Provider_Name: "WE", Spreadsheet_ID: "", Enable: true },
    { Provider_ID: "ORA", Provider_Name: "Orange", Spreadsheet_ID: "", Enable: true },
    { Provider_ID: "ET", Provider_Name: "Etisalat", Spreadsheet_ID: "", Enable: true }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(records.map((record) => ({ providerId: record.providerId, id: record.id })))), [
    { providerId: "VF", id: 1 }, { providerId: "TE", id: 2 }, { providerId: "ORA", id: 3 }, { providerId: "ET", id: 4 }
  ]);
  records.forEach((record) => {
    const summary = context.providerSummary_({ websiteSettings: { rows: [] } }, record);
    assert.equal(summary.providerId, record.providerId);
    assert.equal(summary.id, record.id);
  });
});

test("normalized router records and router provider states use canonical provider IDs", () => {
  const { context } = makeHarness();
  const router = context.normalizeRouters_({ status: "available", rows: [{ "Router ID": "r1", "Router Name": "Router", "FInal Price": 100, "Show Router": true }] }, { rows: [] }, { providerId: "ORA", id: 3, name: "Orange", slug: "orange" }, true);
  assert.equal(router.rows[0].providerId, "ORA");
  assert.equal(router.rows[0].canonicalProviderId, "ORA");
  assert.equal(router.rows[0].providerLegacyId, 3);
  const { payload } = getJson(context, "routers");
  assert.equal(payload.providers[0].providerId, "TE");
  assert.equal(payload.providers[0].id, 2);
});

test("Router Offers and Master_Plans remain explicitly schema-unestablished rather than rejecting invented headers", () => {
  const { context } = makeHarness();
  const offer = context.getMainConfig_().routerOffers;
  const master = context.getMainConfig_().masterPlans;
  assert.equal(offer.schema.status, "not_established");
  assert.equal(master.schema.status, "not_established");
  assert.equal(offer.status, "available");
  assert.equal(master.status, "available");
  const duplicateWorkbook = { getSheetByName(name) {
    return name === "Router Offers" ? table(["Offer_ID", "Offer ID"], [["o1", "o1"]]) : null;
  } };
  const duplicate = context.readMappedMainTable_(duplicateWorkbook, "routerOffers");
  assert.equal(duplicate.errorCode, "UNSUPPORTED_SCHEMA");
});
