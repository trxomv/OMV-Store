/**
 * OMV Store central, read-only website data API.
 *
 * Production source for the existing Web App deployment.
 * Script Property OMV_MAIN_CONFIG_ID must hold the existing main workbook ID.
 * The property name is a key; do not replace it with the workbook ID.
 * Provider spreadsheet IDs are read dynamically from Telecom Providers and
 * are never included in API responses.
 */
var API_VERSION_ = 1;
var MAIN_ID_PROPERTY_ = "OMV_MAIN_CONFIG_ID";
var DEFAULT_REFRESH_SECONDS_ = 15;
var MAX_CACHE_SECONDS_ = 3600;
var CACHE_PREFIX_ = "omv-central-v1:";

function doGet(event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var callback = safeCallback_(parameters.callback);
  var resource = normalizeText_(parameters.resource || "site").toLowerCase();
  var providerId = normalizeProviderId_(parameters.id);
  try {
    var response = cachedResource_(resource, providerId);
    return output_(response, callback);
  } catch (error) {
    // Do not log exception text; Google errors can contain a spreadsheet ID.
    console.error("OMV central API request failed: " + safeErrorName_(error));
    return output_({
      ok: false,
      apiVersion: API_VERSION_,
      resource: resource || "unknown",
      sourceStatus: "error",
      errorCode: "source_unavailable",
      message: "تعذر قراءة مصدر البيانات حاليًا. تحقق من إعداد Script Properties وصلاحيات القراءة."
    }, callback);
  }
}

function cachedResource_(resource, providerId) {
  if (["site", "provider", "routers"].indexOf(resource) < 0) {
    return { ok: false, apiVersion: API_VERSION_, resource: resource, sourceStatus: "error", errorCode: "unknown_resource", message: "المورد المطلوب غير معروف." };
  }
  if (resource === "provider" && !providerId) {
    return { ok: false, apiVersion: API_VERSION_, resource: resource, sourceStatus: "error", errorCode: "invalid_provider", message: "معرّف المزوّد غير صالح." };
  }
  var key = CACHE_PREFIX_ + resource + (providerId ? ":" + providerId : "");
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { cache.remove(key); }
  }

  var payload;
  if (resource === "site") payload = buildSiteResource_();
  else if (resource === "provider") payload = buildProviderResource_(providerId);
  else payload = buildRoutersResource_();

  var ttl = clampCacheSeconds_(payload.refreshSeconds || DEFAULT_REFRESH_SECONDS_);
  var serialized = JSON.stringify(payload);
  // Apps Script CacheService rejects values over its per-item size limit.
  if (serialized.length < 90000) {
    try { cache.put(key, serialized, ttl); } catch (_) {}
  }
  return payload;
}

function getMainConfig_() {
  var cache = CacheService.getScriptCache();
  var key = CACHE_PREFIX_ + "main";
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { cache.remove(key); }
  }

  var mainId = PropertiesService.getScriptProperties().getProperty(MAIN_ID_PROPERTY_);
  if (!mainId || !String(mainId).trim()) throw new Error("Missing main configuration property");
  var spreadsheet;
  try { spreadsheet = SpreadsheetApp.openById(String(mainId).trim()); }
  catch (_) { throw new Error("Main configuration is not accessible"); }

  var main = {
    providersTable: readMappedMainTable_(spreadsheet, "providers", ["Telecom Proiders"]),
    categories: readMappedMainTable_(spreadsheet, "categories"),
    routerOffers: readMappedMainTable_(spreadsheet, "routerOffers"),
    masterPlans: readMappedMainTable_(spreadsheet, "masterPlans"),
    websiteSettings: readMappedMainTable_(spreadsheet, "websiteSettings"),
    socialMedia: readMappedMainTable_(spreadsheet, "socialMedia"),
    paymentMethods: readMappedMainTable_(spreadsheet, "paymentMethods"),
    announcements: readMappedMainTable_(spreadsheet, "announcements"),
    terms: readMappedMainTable_(spreadsheet, "siteTerms", ["Terms&Conditions"])
  };
  main.refreshConfiguration = readRefreshConfiguration_(main.websiteSettings);
  main.refreshSeconds = getRefreshSeconds_(main.websiteSettings);
  main.providers = providerRecords_(main.providersTable);
  var serialized = JSON.stringify(main);
  if (serialized.length < 90000) {
    try { cache.put(key, serialized, clampCacheSeconds_(main.refreshSeconds)); } catch (_) {}
  }
  return main;
}

function buildSiteResource_() {
  var main = getMainConfig_();
  var providers = [];
  main.providers.forEach(function (provider) {
    var summary = providerSummary_(main, provider);
    delete summary.spreadsheetId;
    providers.push(summary);
  });
  return {
    ok: true,
    apiVersion: API_VERSION_,
    resource: "site",
    sourceStatus: "available",
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    refreshConfiguration: main.refreshConfiguration,
    settings: publicWebsiteSettings_(main.websiteSettings, main.refreshSeconds, main.refreshConfiguration),
    categories: activeRows_(main.categories),
    providers: providers,
    contacts: activeRows_(main.socialMedia),
    paymentMethods: activeRows_(main.paymentMethods),
    announcements: activeRows_(main.announcements),
    terms: tableSummary_(main.terms),
    routerOffers: tableSummary_(main.routerOffers),
    masterPlans: tableSummary_(main.masterPlans)
  };
}

function checkboxState_(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || normalizeText_(value) === "") return null;
  var text = normalizeText_(value).toLowerCase();
  if (["true", "1", "yes", "y", "نعم", "مفعل", "مفعّل", "نشط", "نشطة"].indexOf(text) >= 0) return true;
  if (["false", "0", "no", "n", "لا", "معطل", "معطّل", "غير مفعل", "غير مفعّل"].indexOf(text) >= 0) return false;
  return null;
}

function settingState_(table, key) {
  if (!key) return { status: "not_applicable", key: null, enabled: null };
  var row = findRow_(table, ["Settings"], key);
  if (!row) return { status: "missing", key: key, enabled: null };
  var enabled = checkboxState_(rowValue_(row, ["Enable"]));
  return { status: enabled === null ? "invalid" : "available", key: key, enabled: enabled };
}

function providerSettingState_(table, adapter, settingName) {
  var key = adapter && adapter.settings ? adapter.settings[settingName] : null;
  return settingState_(table, key);
}

function providerSettingsDiagnostics_(provider, mainPageSetting, localSettings) {
  var diagnostics = [];
  function append(state, location, affectsRendering) {
    if (!state || state.status === "not_applicable" || state.status === "available") return;
    diagnostics.push({
      code: state.status === "missing" ? "SETTING_MISSING" : "SETTING_INVALID_BOOLEAN",
      severity: state.status === "missing" ? "warning" : "error",
      providerId: provider.providerId,
      worksheet: location,
      setting: state.key,
      status: state.status,
      affectsRendering: Boolean(affectsRendering)
    });
  }
  append(mainPageSetting, "Website Settings", true);
  Object.keys(localSettings || {}).forEach(function (key) {
    append(localSettings[key], "Page Settings", key !== "discountRate");
  });
  return diagnostics;
}

function tableSchemaDiagnostics_(provider, tables) {
  var diagnostics = [];
  var adapter = providerAdapter_(provider.providerId || provider.id);
  Object.keys(tables || {}).forEach(function (resource) {
    var table = tables[resource];
    if (!table || table.status === "not_applicable") return;
    if (table.status === "unsupported_schema" || table.status === "missing_headers") {
      diagnostics.push({
        code: "SCHEMA_UNSUPPORTED", severity: "error", providerId: provider.providerId, resource: resource,
        worksheet: table.sheetName || null,
        missingHeaders: table.schema && table.schema.missing ? table.schema.missing : [],
        duplicateHeaders: table.schema && table.schema.duplicate ? table.schema.duplicate : []
      });
      return;
    }
    if (table.status === "not_found") {
      diagnostics.push({ code: "WORKSHEET_MISSING", severity: "error", providerId: provider.providerId, resource: resource, worksheet: table.sheetName || null });
      return;
    }
    if (table.status !== "available" && table.status !== "empty") return;
    var counts = {};
    function add(code) { counts[code] = (counts[code] || 0) + 1; }
    (table.rows || []).forEach(function (row) {
      if (["standard", "home", "air", "eom", "to15"].indexOf(resource) >= 0) {
        var visibilityHeader = resource === "eom" || resource === "to15" ? "Show" : "Show Rate Plan";
        var rawVisibility = rowValue_(row, [visibilityHeader]);
        var visible = checkboxState_(rawVisibility);
        if (hasValue_(rawVisibility) && visible === null) add("INVALID_CHECKBOX");
        if (visible !== true) return;
        if (!hasValue_(rowValue_(row, ["Plan_ID", "Plan ID", "No. of Plan"]))) add("MISSING_IDENTIFIER");
        if (!hasValue_(rowValue_(row, ["Plan-Name", "Plan Name", "Name"]))) add("MISSING_NAME");
        var quota = numberValue_(rowValue_(row, resource === "home" || resource === "air" ? ["GBs", "GB"] : ["MBs", "MB"]));
        if (!isFinite(quota) || quota <= 0) add("INVALID_QUOTA");
        var price = numberValue_(rowValue_(row, ["Final Price", "FInal Price"]));
        if (!isFinite(price) || price <= 0) add("INVALID_PRICE");
        var minutesValue = rowValue_(row, ["Minutes", "Minute"]);
        if (minutesValue !== undefined) {
          var minutes = numberValue_(minutesValue);
          if (!isFinite(minutes) || minutes < 0) add("INVALID_MINUTES");
        }
      } else if (resource === "routers") {
        var routerHeader = adapter ? adapter.routerVisibilityHeader : "Show Router";
        var rawRouter = rowValue_(row, [routerHeader]);
        var visibleRouter = checkboxState_(rawRouter);
        if (hasValue_(rawRouter) && visibleRouter === null) add("INVALID_ROUTER_CHECKBOX");
        var rawOffer = rowValue_(row, ["Show Offer"]);
        if (hasValue_(rawOffer) && checkboxState_(rawOffer) === null) add("INVALID_OFFER_CHECKBOX");
        if (visibleRouter !== true) return;
        if (!hasValue_(rowValue_(row, ["Router ID"]))) add("MISSING_IDENTIFIER");
        if (!hasValue_(rowValue_(row, ["Router Name"]))) add("MISSING_NAME");
        var routerPrice = numberValue_(rowValue_(row, ["FInal Price", "Final Price"]));
        if (!isFinite(routerPrice) || routerPrice <= 0) add("INVALID_PRICE");
      } else if (resource === "competitions") {
        var rawEnabled = rowValue_(row, ["Enable"]);
        var enabled = checkboxState_(rawEnabled);
        if (hasValue_(rawEnabled) && enabled === null) add("INVALID_COMPETITION_CHECKBOX");
        if (enabled !== true) return;
        if (!hasValue_(rowValue_(row, ["Competition ID"]))) add("MISSING_IDENTIFIER");
        if (!hasValue_(rowValue_(row, ["Competition Title"]))) add("MISSING_TITLE");
      }
    });
    Object.keys(counts).forEach(function (code) {
      diagnostics.push({ code: code, severity: "warning", providerId: provider.providerId, resource: resource, count: counts[code] });
    });
  });
  return diagnostics;
}

function normalizeCompetitions_(table, enabled) {
  if (!enabled) return { status: "disabled", rows: [] };
  if (!table || (table.status !== "available" && table.status !== "empty")) return { status: table ? table.status : "not_inspected", rows: [] };
  var rows = (table.rows || []).filter(function (row) {
    return isEnabled_(rowValue_(row, ["Enable"])) && hasValue_(rowValue_(row, ["Competition ID"])) && hasValue_(rowValue_(row, ["Competition Title"]));
  }).map(function (row) {
    var benefitType = normalizeText_(rowValue_(row, ["Benefit_Type"]));
    var giftData = rowValue_(row, ["Gift_Data_GB"]);
    var giftDuration = rowValue_(row, ["Gift_Duration"]);
    var durationUnit = normalizeText_(rowValue_(row, ["Duration_Unit"]));
    var benefits = [benefitType, hasValue_(giftData) ? normalizeText_(giftData) + " GB" : "", hasValue_(giftDuration) ? normalizeText_(giftDuration) + (durationUnit ? " " + durationUnit : "") : ""].filter(Boolean);
    var title = normalizeText_(rowValue_(row, ["Competition Title"]));
    var endDate = jsonValue_(rowValue_(row, ["End_Date"]));
    return {
      competitionId: rowValue_(row, ["Competition ID"]),
      title: title,
      benefitType: benefitType,
      giftDataGb: giftData,
      giftDuration: giftDuration,
      durationUnit: durationUnit,
      startDate: jsonValue_(rowValue_(row, ["Start_Date"])),
      endDate: endDate,
      terms: normalizeText_(rowValue_(row, ["Terms"])),
      sortOrder: numberValue_(rowValue_(row, ["Sort_Order"])),
      enabled: true,
      Competition_Name: title,
      Description: benefits.join(" · "),
      End_Date: endDate
    };
  });
  rows.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  return { status: rows.length ? "available" : "empty", rows: rows };
}

function buildProviderResource_(providerId) {
  var main = getMainConfig_();
  var provider = findProvider_(main.providers, providerId);
  if (!provider) {
    return { ok: false, apiVersion: API_VERSION_, resource: "provider", sourceStatus: "error", errorCode: "provider_not_found", message: "هذا المزوّد غير موجود في السجل المركزي." };
  }
  var meta = providerAdapter_(providerId);
  if (!meta) {
    return { ok: true, apiVersion: API_VERSION_, resource: "provider", generatedAt: new Date().toISOString(), refreshSeconds: main.refreshSeconds, provider: publicProvider_(provider), sourceStatus: "unsupported_schema", tables: {}, pageSettings: { status: "not_inspected", rows: [] }, terms: { status: "not_inspected", rows: [] } };
  }

  var mainPageSetting = settingState_(main.websiteSettings, "Show " + meta.name + " Page");
  var providerSpreadsheet;
  try {
    if (!provider.spreadsheetId) throw new Error("Missing provider source");
    providerSpreadsheet = SpreadsheetApp.openById(provider.spreadsheetId);
  } catch (_) {
    return {
      ok: true, apiVersion: API_VERSION_, resource: "provider", generatedAt: new Date().toISOString(), refreshSeconds: main.refreshSeconds,
      provider: publicProvider_(provider), sourceStatus: "inaccessible", pageEnabled: mainPageSetting.enabled === true,
      message: "مصدر بيانات هذا المزوّد غير متاح حاليًا.", tables: {},
      pageSettings: { status: "unavailable", rows: [] }, terms: { status: "unavailable", rows: [] }, sections: emptySections_()
    };
  }

  var tables = {};
  ["standard", "home", "eom", "to15", "air", "customPricing", "addons", "routers", "routerDetails", "pageSettings", "terms", "competitions"].forEach(function (key) {
    var mapping = providerTableFallback_(meta, key);
    if (mapping) tables[key] = readProviderTable_(providerSpreadsheet, providerId, key, mapping);
  });
  ["home", "eom", "to15", "air", "customPricing", "addons"].forEach(function (key) {
    if (!tables[key]) tables[key] = notApplicableTable_();
  });

  var pageSettings = tables.pageSettings || notApplicableTable_();
  var localSettings = {};
  ["page", "offers", "discountRate", "routers", "eom", "to15", "competitions"].forEach(function (key) {
    localSettings[key] = providerSettingState_(pageSettings, meta, key);
  });
  var providerPageEnabled = localSettings.page.status === "not_applicable" ? true : localSettings.page.enabled === true;
  var pageEnabled = mainPageSetting.enabled === true && providerPageEnabled;
  var showOffers = localSettings.offers.enabled === true;
  var showRouters = localSettings.routers.enabled === true;
  var showCompetitions = localSettings.competitions.enabled === true;
  var visiblePlans = visiblePlanRows_(tables.standard);
  var sourceStatus = provider.enabled ? planSourceStatus_(tables.standard, visiblePlans) : "disabled";
  var terms = normalizeTerms_(tables.terms || notApplicableTable_());
  var routers = normalizeRouters_(tables.routers || notApplicableTable_(), tables.routerDetails || notApplicableTable_(), provider, showRouters);
  var competitions = normalizeCompetitions_(tables.competitions || notApplicableTable_(), showCompetitions && pageEnabled && provider.enabled);
  var pageState = !provider.enabled ? "disabled" : !pageEnabled ? "page_disabled" : !showOffers ? "offers_disabled" : sourceStatus;
  var diagnostics = providerSettingsDiagnostics_(provider, mainPageSetting, localSettings).concat(tableSchemaDiagnostics_(provider, tables));

  return {
    ok: true,
    apiVersion: API_VERSION_,
    resource: "provider",
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    provider: publicProvider_(provider),
    sourceStatus: sourceStatus,
    pageEnabled: pageEnabled,
    pageSettings: {
      status: pageSettings.status, rows: pageSettings.rows,
      mainPageEnabled: mainPageSetting.enabled,
      providerPageEnabled: localSettings.page.status === "not_applicable" ? null : localSettings.page.enabled,
      offersEnabled: showOffers, routersEnabled: showRouters,
      discountRateEnabled: localSettings.discountRate.status === "not_applicable" ? null : localSettings.discountRate.enabled,
      competitionsEnabled: showCompetitions
    },
    pageState: pageState,
    diagnostics: diagnostics,
    sections: {
      offers: { enabled: pageEnabled && showOffers && provider.enabled, status: pageEnabled && showOffers ? sourceStatus : "disabled" },
      routers: { enabled: showRouters && pageEnabled && provider.enabled, status: routers.status, rows: routers.rows },
      terms: { enabled: provider.enabled && pageEnabled, status: terms.status, rows: terms.rows },
      competitions: { enabled: showCompetitions && pageEnabled && provider.enabled, status: competitions.status, rows: competitions.rows }
    },
    terms: terms,
    tables: tables,
    site: {
      settings: publicWebsiteSettings_(main.websiteSettings, main.refreshSeconds, main.refreshConfiguration),
      announcements: targetRowsForProvider_(main.announcements, provider),
      contacts: targetRowsForProvider_(main.socialMedia, provider),
      paymentMethods: activeRows_(main.paymentMethods)
    },
    // Only WE uses the legacy normalizer; this shape is a transport adapter,
    // not a separate data source or a pricing calculation.
    we: String(providerId) === "TE" ? buildLegacyWePayload_(main, tables, provider, pageEnabled, localSettings, showOffers, competitions) : null
  };
}

function buildLegacyWePayload_(main, tables, provider, pageEnabled, localSettings, showOffers, competitions) {
  var settingRows = [];
  (main.websiteSettings.rows || []).forEach(function (row) {
    var key = normalizeText_(rowValue_(row, ["Settings"]));
    if (!key) return;
    var normalized = key === "Show Copy Button-Package cards" ? "Show Copy Button"
      : key === "Show Share Button-Package cards" ? "Show Share Button" : key;
    settingRows.push({ Settings: normalized, Value: rowValue_(row, ["Value"]), Enable: rowValue_(row, ["Enable"]) });
  });

  targetRowsForProvider_(main.socialMedia, provider).forEach(function (row) {
    var type = normalizeText_(rowValue_(row, ["Contact Type"]));
    var key = type === "WhatsApp Number" ? "WhatsApp Number"
      : type === "WhatsApp Group" ? "WhatsApp Group URL"
      : type === "Telegram Group" ? "Telegram Group URL"
      : type === "Telegram Number" ? "Telegram Number" : "";
    if (key) settingRows.push({ Settings: key, Value: rowValue_(row, ["Value"]), Enable: true });
  });

  (tables.pageSettings.rows || []).forEach(function (row) {
    var key = normalizeText_(rowValue_(row, ["Settings"]));
    if (key === "Custom Rate Plans From 1" || key === "Custom Rate Plans From 16") {
      settingRows.push({ Settings: key, Value: rowValue_(row, ["Enable"]), Enable: rowValue_(row, ["Enable"]) });
    }
  });
  settingRows.push({ Settings: "Show Plans to EOM", Value: localSettings.eom.enabled === true, Enable: localSettings.eom.enabled === true });
  settingRows.push({ Settings: "Show Plans to 15", Value: localSettings.to15.enabled === true, Enable: localSettings.to15.enabled === true });
  settingRows.push({ Settings: "Show Competitions", Value: localSettings.competitions.enabled === true, Enable: localSettings.competitions.enabled === true });

  var globalAnnouncements = targetRowsForProvider_(main.announcements, provider);
  var legacyAnnouncements = { status: "available", headers: ["No.", "Value", "Enable"], rows: globalAnnouncements.map(function (row) {
    return { "No.": rowValue_(row, ["No."]), Value: rowValue_(row, ["Value"]), Enable: true };
  }) };
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    providerEnabled: provider.enabled,
    pageEnabled: pageEnabled,
    offersEnabled: showOffers,
    competitions: competitions.rows,
    competitionsEnabled: localSettings.competitions.enabled === true,
    sheets: {
      standard: tables.standard || notApplicableTable_(),
      eom: tables.eom || notApplicableTable_(),
      to15: tables.to15 || notApplicableTable_(),
      offers: notApplicableTable_(),
      settings: { status: "available", headers: ["Settings", "Value", "Enable"], rows: settingRows },
      announcements: legacyAnnouncements,
      paymentMethods: { status: "available", headers: ["Payment Method", "Enable"], rows: activeRows_(main.paymentMethods) },
      addons: tables.addons || notApplicableTable_(),
      customPricing: tables.customPricing || notApplicableTable_()
    }
  };
}

function buildRoutersResource_() {
  var main = getMainConfig_();
  var categoryEnabled = categoryIsEnabled_(main.categories, "All Routers");
  var allRouters = [];
  var providerStates = [];
  main.providers.forEach(function (provider) {
    var providerPayload = buildProviderResource_(String(provider.providerId || provider.id));
    var section = providerPayload.sections && providerPayload.sections.routers;
    var rows = section && section.enabled ? section.rows : [];
    Array.prototype.push.apply(allRouters, rows || []);
    providerStates.push({ id: provider.id, providerId: provider.providerId, canonicalProviderId: provider.providerId, name: provider.name, slug: provider.slug, enabled: provider.enabled, sectionEnabled: Boolean(section && section.enabled), status: section ? section.status : "unavailable" });
  });
  allRouters.sort(function (a, b) {
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name));
  });
  return {
    ok: true,
    apiVersion: API_VERSION_,
    resource: "routers",
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    sectionEnabled: categoryEnabled,
    sourceStatus: categoryEnabled ? (allRouters.length ? "available" : "empty") : "disabled",
    providers: providerStates,
    routers: categoryEnabled ? allRouters : []
  };
}

function providerSummary_(main, provider) {
  var meta = providerAdapter_(provider.providerId || provider.id);
  var mainPageSetting = settingState_(main.websiteSettings, "Show " + (meta ? meta.name : provider.name) + " Page");
  var result = {
    id: provider.id,
    providerId: provider.providerId,
    canonicalProviderId: provider.providerId,
    slug: provider.slug,
    name: provider.name,
    enabled: provider.enabled,
    pageEnabled: false,
    mainPageEnabled: mainPageSetting.enabled,
    providerPageEnabled: null,
    offersEnabled: false,
    routersEnabled: false,
    discountRateEnabled: null,
    competitionsEnabled: false,
    sourceStatus: "unavailable",
    status: "unavailable",
    diagnostics: []
  };
  if (!meta || !provider.spreadsheetId) return result;
  try {
    var spreadsheet = SpreadsheetApp.openById(provider.spreadsheetId);
    var page = readProviderTable_(spreadsheet, provider.providerId || provider.id, "pageSettings", meta.workbookResources.providerSettings);
    var local = {};
    ["page", "offers", "discountRate", "routers", "competitions"].forEach(function (key) { local[key] = providerSettingState_(page, meta, key); });
    var providerPageEnabled = local.page.status === "not_applicable" ? true : local.page.enabled === true;
    result.providerPageEnabled = local.page.status === "not_applicable" ? null : local.page.enabled;
    result.pageEnabled = mainPageSetting.enabled === true && providerPageEnabled;
    result.offersEnabled = local.offers.enabled === true;
    result.routersEnabled = local.routers.enabled === true;
    result.discountRateEnabled = local.discountRate.status === "not_applicable" ? null : local.discountRate.enabled;
    result.competitionsEnabled = local.competitions.enabled === true;
    var plans = readProviderTable_(spreadsheet, provider.providerId || provider.id, "standard", meta.workbookResources.packages.mobile);
    result.sourceStatus = planSourceStatus_(plans, visiblePlanRows_(plans));
    result.diagnostics = providerSettingsDiagnostics_(provider, mainPageSetting, local).concat(tableSchemaDiagnostics_(provider, { pageSettings: page, standard: plans }));
    if (!provider.enabled) result.status = "disabled";
    else if (!result.pageEnabled) result.status = "page_disabled";
    else if (!result.offersEnabled) result.status = "offers_disabled";
    else result.status = result.sourceStatus;
  } catch (_) {
    result.sourceStatus = "inaccessible";
    result.status = provider.enabled ? "inaccessible" : "disabled";
  }
  return result;
}

function readTable_(spreadsheet, sheetName) {
  if (!sheetName) return notApplicableTable_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return { status: "not_found", errorCode: "MISSING_WORKSHEET", sheetName: sheetName, headers: [], rows: [] };
  try {
    var range = sheet.getDataRange();
    var values = range.getValues();
    if (!values || !values.length || !values[0].some(function (value) { return normalizeText_(value) !== ""; })) {
      return { status: "missing_headers", errorCode: "UNSUPPORTED_SCHEMA", sheetName: sheetName, headers: [], rows: [] };
    }
    var formulas = range.getFormulas();
    var headers = values[0].map(function (value) { return normalizeText_(value); });
    var rows = [];
    for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      var row = values[rowIndex];
      var record = {};
      var hasValue = false;
      headers.forEach(function (header, columnIndex) {
        if (!header) return;
        var value = row[columnIndex];
        if (value !== "" && value !== null && value !== undefined) hasValue = true;
        record[header] = jsonValue_(value);
      });
      if (!hasValue) continue;
      var priceIndex = findHeaderIndex_(headers, ["Final Price", "FInal Price"]);
      if (priceIndex >= 0 && formulas[rowIndex] && formulas[rowIndex][priceIndex]) {
        var discount = discountFromFormula_(formulas[rowIndex][priceIndex]);
        if (discount !== null && !hasValue_(record["Discount Percent"])) record["Discount Percent"] = discount;
      }
      rows.push(record);
    }
    return { status: rows.length ? "available" : "empty", sheetName: sheetName, headers: headers.filter(Boolean), rows: rows };
  } catch (_) {
    return { status: "error", errorCode: "INTERNAL_SERVER_ERROR", sheetName: sheetName, headers: [], rows: [] };
  }
}

function providerTableFallback_(adapter, key) {
  if (!adapter) return "";
  if (key === "standard") return adapter.workbookResources.packages.mobile;
  if (key === "home" || key === "eom" || key === "to15" || key === "air") return adapter.workbookResources.packages[key] || (key === "home" ? adapter.workbookResources.packages.air : "") || "";
  if (key === "pageSettings") return adapter.workbookResources.providerSettings;
  if (key === "terms") return adapter.workbookResources.providerTerms;
  return adapter.workbookResources[key] || "";
}

function readProviderTable_(spreadsheet, providerId, logicalKey, fallbackName) {
  // The adapter is the only worksheet-resolution path. fallbackName remains in
  // the signature for v1 call-site compatibility but is intentionally unused.
  return readMappedTable_(spreadsheet, providerId, logicalKey);
}

function readTableFirstAvailable_(spreadsheet, sheetNames) {
  for (var index = 0; index < sheetNames.length; index += 1) {
    if (spreadsheet.getSheetByName(sheetNames[index])) return readTable_(spreadsheet, sheetNames[index]);
  }
  return readTable_(spreadsheet, sheetNames[0]);
}

function notApplicableTable_() {
  return { status: "not_applicable", headers: [], rows: [] };
}

function tableSummary_(table) {
  return { status: table ? table.status : "not_inspected", headers: table ? table.headers : [], rows: table ? table.rows : [] };
}

function providerRecords_(table) {
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.map(function (row) {
    var canonicalId = normalizeProviderId_(rowValue_(row, ["Provider_ID"]));
    if (!canonicalId) return null;
    var adapter = providerAdapter_(canonicalId);
    return {
      id: adapter ? adapter.legacyRouteId : null,
      providerId: canonicalId,
      slug: adapter ? adapter.slug : "provider-" + canonicalId,
      name: normalizeText_(rowValue_(row, ["Provider_Name", "Provider_ Name"])) || (adapter ? adapter.name : "مزوّد " + canonicalId),
      enabled: isEnabled_(rowValue_(row, ["Enable"])),
      spreadsheetId: normalizeText_(rowValue_(row, ["Spreadsheet_ID"]))
    };
  }).filter(Boolean).sort(function (a, b) { return a.id - b.id; });
}

function publicProvider_(provider) {
  return { id: provider.id, providerId: provider.providerId || normalizeProviderId_(provider.id), slug: provider.slug, name: provider.name, enabled: provider.enabled };
}

function findProvider_(providers, id) {
  var canonical = normalizeProviderId_(id);
  for (var index = 0; index < providers.length; index += 1) if (String(providers[index].providerId || normalizeProviderId_(providers[index].id)) === canonical) return providers[index];
  return null;
}

function publicWebsiteSettings_(table, refreshSeconds, refreshConfiguration) {
  var rows = table && table.rows ? table.rows : [];
  var configuration = refreshConfiguration || readRefreshConfiguration_(table);
  var flags = {};
  var administrativeFlags = {};
  var configuredValues = {};
  rows.forEach(function (row) {
    var key = normalizeText_(rowValue_(row, ["Settings"]));
    if (!key) return;
    var administrativeEnabled = isEnabled_(rowValue_(row, ["Enable"]));
    administrativeFlags[key] = administrativeEnabled;
    configuredValues[key] = rowValue_(row, ["Value"]);
    flags[key] = normalizeHeader_(key) === normalizeHeader_("Auto Data Refresh")
      ? Boolean(configuration.effective.autoDataRefresh)
      : administrativeEnabled;
  });
  return {
    status: table ? table.status : "not_inspected",
    rows: rows,
    flags: flags,
    administrativeFlags: administrativeFlags,
    configuredValues: configuredValues,
    effectiveRefresh: configuration.effective,
    refreshSeconds: refreshSeconds
  };
}

function activeRows_(table) {
  return table && Array.isArray(table.rows) ? table.rows.filter(function (row) { return isEnabled_(rowValue_(row, ["Enable"])); }) : [];
}

function targetRowsForProvider_(table, provider) {
  return activeRows_(table).filter(function (row) {
    var target = normalizeTarget_(rowValue_(row, ["Target"]));
    if (target === "all") return true;
    // Only explicit labels are interpreted. A bare number is deliberately not
    // treated as Provider_ID without a documented target contract.
    return [provider.slug.toLowerCase(), provider.name.toLowerCase(), "provider:" + provider.id].indexOf(target) >= 0;
  });
}

function normalizeTerms_(table) {
  var isMainTerms = table && table.headers && table.headers.some(function (header) { return normalizeHeader_(header) === normalizeHeader_("Term_Titel"); });
  var canonical = canonicalTerms_(table, isMainTerms);
  canonical.rows = canonical.rows.map(function (row) {
    return { id: row.id, title: row.title, text: row.text, type: row.type || "General", enabled: row.enabled, displayOrder: row.displayOrder };
  });
  return canonical;
}

function normalizeRouters_(table, detailsTable, provider, sectionEnabled) {
  if (!sectionEnabled) return { status: "disabled", rows: [] };
  if (!table || (table.status !== "available" && table.status !== "empty")) return { status: table ? table.status : "not_inspected", rows: [] };
  var adapter = providerAdapter_(provider.providerId || provider.id);
  var routerVisibilityHeader = adapter ? adapter.routerVisibilityHeader : "Enable";
  var rows = (table.rows || []).filter(function (row) {
    var routerName = normalizeText_(rowValue_(row, ["Router Name"]));
    var finalPrice = numberValue_(rowValue_(row, ["FInal Price", "Final Price"]));
    return isEnabled_(rowValue_(row, [routerVisibilityHeader])) && routerName !== "" && isFinite(finalPrice) && finalPrice > 0;
  }).map(function (row) {
    var showOffer = isEnabled_(rowValue_(row, ["Show Offer"]));
    var details = (detailsTable && detailsTable.rows ? detailsTable.rows : []).filter(function (detail) {
      return String(rowValue_(detail, ["Router ID"])) === String(rowValue_(row, ["Router ID"]));
    }).sort(function (a, b) { return numberValue_(rowValue_(a, ["Sort Order"])) - numberValue_(rowValue_(b, ["Sort Order"])); }).map(function (detail) {
      return { section: normalizeText_(rowValue_(detail, ["Section"])), title: normalizeText_(rowValue_(detail, ["Titel", "Title"])), content: normalizeText_(rowValue_(detail, ["Content"])) };
    }).filter(function (detail) { return detail.section || detail.title || detail.content; });
    var finalPrice = numberValue_(rowValue_(row, ["FInal Price", "Final Price"]));
    var discountPrice = numberValue_(rowValue_(row, ["Discount Price"]));
    return {
      routerId: rowValue_(row, ["Router ID"]),
      providerId: provider.providerId || normalizeProviderId_(provider.id),
      canonicalProviderId: provider.providerId || normalizeProviderId_(provider.id),
      providerLegacyId: provider.id,
      providerName: provider.name,
      providerSlug: provider.slug,
      name: normalizeText_(rowValue_(row, ["Router Name"])),
      price: numberValue_(rowValue_(row, ["Price"])),
      increase: numberValue_(rowValue_(row, ["Increase"])),
      finalPrice: finalPrice,
      showOffer: showOffer,
      visibility: { router: true, deviceOffer: showOffer },
      discountPrice: showOffer && isFinite(discountPrice) && discountPrice > 0 ? discountPrice : null,
      sortOrder: numberValue_(rowValue_(row, ["Sort Order"])),
      details: details
    };
  });
  return { status: rows.length ? "available" : "empty", rows: rows };
}

function visiblePlanRows_(table) {
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.filter(function (row) {
    var visible = rowValue_(row, ["Show Rate Plan", "Show"]);
    if (visible === undefined || !isEnabled_(visible)) return false;
    var planId = rowValue_(row, ["No. of Plan", "No of Plan", "Plan ID", "Package ID"]);
    var quota = numberValue_(rowValue_(row, ["MBs", "MB", "Megabytes", "GBs", "GB"]));
    var finalPrice = numberValue_(rowValue_(row, ["Final Price", "FInal Price", "Final Price (EGP)"]));
    if (!hasValue_(planId) || !isFinite(quota) || quota <= 0 || !isFinite(finalPrice) || finalPrice <= 0) return false;
    var minutesValue = rowValue_(row, ["Minutes", "Minute"]);
    if (minutesValue !== undefined) {
      var minutes = numberValue_(minutesValue);
      if (!isFinite(minutes) || minutes < 0) return false;
    }
    return true;
  });
}

function planSourceStatus_(table, visibleRows) {
  if (!table) return "not_inspected";
  if (table.status === "error") return "error";
  if (table.status === "not_found") return "unavailable";
  if (table.status === "missing_headers") return "unsupported_schema";
  if (table.status === "empty") return "empty";
  if (table.status !== "available") return table.status || "unavailable";
  return visibleRows && visibleRows.length ? "available" : "empty";
}

function categoryIsEnabled_(table, categoryId) {
  if (!table || !Array.isArray(table.rows)) return false;
  var target = normalizeHeader_(categoryId);
  for (var index = 0; index < table.rows.length; index += 1) {
    var row = table.rows[index];
    var id = normalizeHeader_(rowValue_(row, ["Category ID"]));
    var name = normalizeHeader_(rowValue_(row, ["Category Name"]));
    if (id === target || name === target) return isEnabled_(rowValue_(row, ["Enable"]));
  }
  return false;
}

function settingEnabled_(table, key, fallback) {
  var row = findRow_(table, ["Settings"], key);
  if (!row) return fallback;
  return isEnabled_(rowValue_(row, ["Enable"]));
}

function getRefreshSeconds_(table) {
  var configuration = readRefreshConfiguration_(table);
  // The canonical global switch is authoritative. Legacy Auto Refresh Seconds
  // and positive defaults must never activate polling when it is absent.
  var hasAutoDataRefresh = (table && table.rows || []).some(function (row) {
    return normalizeHeader_(rowValue_(row, ["Settings"])) === normalizeHeader_("Auto Data Refresh");
  });
  if (!hasAutoDataRefresh || !configuration.effective.autoDataRefresh) return 0;
  return configuration.effective.generalDataChangeCheckSeconds || 0;
}
function findRow_(table, keyAliases, value) {
  if (!table || !Array.isArray(table.rows)) return null;
  var target = normalizeHeader_(value);
  for (var index = 0; index < table.rows.length; index += 1) {
    if (normalizeHeader_(rowValue_(table.rows[index], keyAliases)) === target) return table.rows[index];
  }
  return null;
}

function rowValue_(row, aliases) {
  if (!row) return undefined;
  var wanted = {};
  aliases.forEach(function (alias) { wanted[normalizeHeader_(alias)] = true; });
  var keys = Object.keys(row);
  for (var index = 0; index < keys.length; index += 1) {
    if (wanted[normalizeHeader_(keys[index])]) return row[keys[index]];
  }
  return undefined;
}

function findHeaderIndex_(headers, aliases) {
  var wanted = {};
  aliases.forEach(function (alias) { wanted[normalizeHeader_(alias)] = true; });
  for (var index = 0; index < headers.length; index += 1) if (wanted[normalizeHeader_(headers[index])]) return index;
  return -1;
}

function isEnabled_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  var text = normalizeText_(value).toLowerCase();
  return ["true", "1", "yes", "y", "نعم", "مفعل", "مفعّل", "نشط", "نشطة"].indexOf(text) >= 0;
}

function normalizeProviderId_(value) {
  return getCanonicalProviderId_(value);
}

function normalizeTarget_(value) { return normalizeText_(value).toLowerCase().replace(/\s+/g, " "); }
function normalizeHeader_(value) { return normalizeText_(value).normalize("NFKC").toLowerCase().replace(/[.]/g, "").replace(/[\s-]+/g, "_"); }
function normalizeText_(value) { return value === null || value === undefined ? "" : String(value).normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim(); }
function numberValue_(value) {
  if (typeof value === "number") return isFinite(value) ? value : NaN;
  var text = normalizeText_(value).replace(/[٠-٩]/g, function (digit) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)); }).replace(/[٬,]/g, "").replace(/٫/g, ".").replace(/[^0-9.+-]/g, "");
  return text ? Number(text) : NaN;
}
function hasValue_(value) { return value !== null && value !== undefined && normalizeText_(value) !== ""; }
function jsonValue_(value) { return value instanceof Date ? value.toISOString() : value; }
function clampCacheSeconds_(seconds) { return Math.max(5, Math.min(MAX_CACHE_SECONDS_, Math.floor(numberValue_(seconds) || DEFAULT_REFRESH_SECONDS_))); }
function safeErrorName_(error) { return error && error.name ? String(error.name).slice(0, 40) : "Error"; }

function discountFromFormula_(formula) {
  var source = String(formula || "").replace(/[٠-٩]/g, function (digit) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)); }).replace(/,/g, ".");
  var deductionPercent = source.match(/\b1\s*-\s*(\d+(?:\.\d+)?)\s*%/i);
  var deductionFraction = source.match(/\b1\s*-\s*(0?\.\d+)(?![\d%])/i);
  var percent = source.match(/(?:\*|×)\s*\(?\s*(\d+(?:\.\d+)?)\s*%\s*\)?/i);
  var fraction = source.match(/(?:\*|×)\s*\(?\s*(0?\.\d+)\s*\)?(?![\d%])/i);
  var subtraction = deductionPercent ? Number(deductionPercent[1]) : deductionFraction ? Number(deductionFraction[1]) * 100 : NaN;
  if (isFinite(subtraction) && subtraction > 0 && subtraction <= 100) return Math.round(subtraction * 100) / 100;
  var multiplier = percent ? Number(percent[1]) / 100 : fraction ? Number(fraction[1]) : NaN;
  if (!isFinite(multiplier) || multiplier <= 0 || multiplier >= 1) return null;
  var discount = Math.round((1 - multiplier) * 10000) / 100;
  return discount > 0 ? discount : null;
}

function safeCallback_(value) {
  var callback = normalizeText_(value);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback) ? callback : "";
}

function output_(payload, callback) {
  var json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  var body = callback ? callback + "(" + json + ");" : json;
  return ContentService.createTextOutput(body).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
