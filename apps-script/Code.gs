/**
 * OMV Store central, read-only website data API.
 *
 * IMPORTANT: This is a new local source file. It has not been deployed.
 * Set OMV_MAIN_CONFIG_ID in Script Properties before manual deployment.
 * Provider spreadsheet IDs are read dynamically from Telecom Providers and
 * are never included in API responses.
 */
var API_VERSION_ = 1;
var MAIN_ID_PROPERTY_ = "OMV_MAIN_CONFIG_ID";
var DEFAULT_REFRESH_SECONDS_ = 15;
var MAX_CACHE_SECONDS_ = 3600;
var CACHE_PREFIX_ = "omv-central-v1:";

var PROVIDER_META_ = {
  "1": { slug: "vodafone", standard: "Mobile_Rate Plans-Website", routers: "Vodafone-Routers", routerDetails: "Vodafone-Routers_Details", pageSettings: "Page Settings", terms: "Terms&Conditions" },
  "2": { slug: "we", standard: "Mobile_Rate Plans-Website", eom: "Mobile_Plans to EOM-Website", to15: "Mobile_Plans to 15-Website", air: "WE-Air_Rate Plans-Website", routers: "WE-Routers", routerDetails: "WE-Routers_Details", pageSettings: "Page Settings", terms: "We-Terms&Conditions", customPricing: "Custom Pricing", addons: "Add-on" },
  "3": { slug: "orange", standard: "Mobile_Rate Plans-Website", routers: "Orange-Routers", routerDetails: "Orange-Routers_Details", pageSettings: "Page Settings", terms: "Orange-Terms&Conditions" },
  "4": { slug: "etisalat", standard: "Mobile_Rate Plans-Website", routers: "Etisalat-Routers", routerDetails: "Etisalat-Routers_Details", pageSettings: "Page Settings", terms: "Etisalat-Terms&Conditions" }
};

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
    providersTable: readTableFirstAvailable_(spreadsheet, ["Telecom Providers", "Telecom Proiders"]),
    categories: readTable_(spreadsheet, "Main Categories"),
    websiteSettings: readTable_(spreadsheet, "Website Settings"),
    socialMedia: readTable_(spreadsheet, "Social Media"),
    paymentMethods: readTable_(spreadsheet, "Payment Methods"),
    announcements: readTable_(spreadsheet, "Announcements"),
    terms: readTable_(spreadsheet, "Terms&Conditions")
  };
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
    settings: publicWebsiteSettings_(main.websiteSettings, main.refreshSeconds),
    categories: activeRows_(main.categories),
    providers: providers,
    contacts: activeRows_(main.socialMedia),
    paymentMethods: activeRows_(main.paymentMethods),
    announcements: activeRows_(main.announcements),
    terms: tableSummary_(main.terms)
  };
}

function buildProviderResource_(providerId) {
  var main = getMainConfig_();
  var provider = findProvider_(main.providers, providerId);
  if (!provider) {
    return { ok: false, apiVersion: API_VERSION_, resource: "provider", sourceStatus: "error", errorCode: "provider_not_found", message: "هذا المزوّد غير موجود في السجل المركزي." };
  }
  var meta = PROVIDER_META_[String(providerId)];
  if (!meta) {
    return { ok: true, apiVersion: API_VERSION_, resource: "provider", generatedAt: new Date().toISOString(), refreshSeconds: main.refreshSeconds, provider: publicProvider_(provider), sourceStatus: "unsupported_schema", tables: {}, pageSettings: { status: "not_inspected", rows: [] }, terms: { status: "not_inspected", rows: [] } };
  }

  var pageEnabled = settingEnabled_(main.websiteSettings, "Show " + provider.name + " Page", false);
  var providerSpreadsheet;
  try {
    if (!provider.spreadsheetId) throw new Error("Missing provider source");
    providerSpreadsheet = SpreadsheetApp.openById(provider.spreadsheetId);
  } catch (_) {
    return {
      ok: true, apiVersion: API_VERSION_, resource: "provider", generatedAt: new Date().toISOString(), refreshSeconds: main.refreshSeconds,
      provider: publicProvider_(provider), sourceStatus: "inaccessible", pageEnabled: pageEnabled,
      message: "مصدر بيانات هذا المزوّد غير متاح حاليًا.", tables: {},
      pageSettings: { status: "unavailable", rows: [] }, terms: { status: "unavailable", rows: [] }, sections: emptySections_()
    };
  }

  var tables = {};
  Object.keys(meta).forEach(function (key) {
    if (key === "slug") return;
    tables[key] = readTable_(providerSpreadsheet, meta[key]);
  });
  ["eom", "to15", "air", "customPricing", "addons"].forEach(function (key) {
    if (!tables[key]) tables[key] = notApplicableTable_();
  });

  var pageSettings = tables.pageSettings || notApplicableTable_();
  var showOffers = settingEnabled_(pageSettings, "Show Offers " + provider.name, false);
  var showRouters = settingEnabled_(pageSettings, "Show " + provider.name + " Routers", false);
  var showPlans = settingEnabled_(main.websiteSettings, "Show " + provider.name + " Page", false);
  var visiblePlans = visiblePlanRows_(tables.standard);
  var sourceStatus = provider.enabled ? planSourceStatus_(tables.standard, visiblePlans) : "disabled";
  var terms = normalizeTerms_(tables.terms || notApplicableTable_());
  var routers = normalizeRouters_(tables.routers || notApplicableTable_(), tables.routerDetails || notApplicableTable_(), provider, showRouters);
  var pageState = !provider.enabled ? "disabled" : !showPlans ? "page_disabled" : !showOffers ? "offers_disabled" : sourceStatus;

  return {
    ok: true,
    apiVersion: API_VERSION_,
    resource: "provider",
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    provider: publicProvider_(provider),
    sourceStatus: sourceStatus,
    pageEnabled: showPlans,
    pageSettings: { status: pageSettings.status, rows: pageSettings.rows, offersEnabled: showOffers, routersEnabled: showRouters },
    pageState: pageState,
    sections: {
      offers: { enabled: showPlans && showOffers && provider.enabled, status: showPlans && showOffers ? sourceStatus : "disabled" },
      routers: { enabled: showRouters && showPlans && provider.enabled, status: routers.status, rows: routers.rows },
      terms: { enabled: provider.enabled && showPlans, status: terms.status, rows: terms.rows }
    },
    terms: terms,
    tables: tables,
    site: {
      settings: publicWebsiteSettings_(main.websiteSettings, main.refreshSeconds),
      announcements: targetRowsForProvider_(main.announcements, provider),
      contacts: targetRowsForProvider_(main.socialMedia, provider),
      paymentMethods: activeRows_(main.paymentMethods)
    },
    // Only WE uses the legacy normalizer; this shape is a transport adapter,
    // not a separate data source or a pricing calculation.
    we: String(providerId) === "2" ? buildLegacyWePayload_(main, tables, provider, showOffers) : null
  };
}

function buildLegacyWePayload_(main, tables, provider, showOffers) {
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
      settingRows.push({ Settings: key, Value: rowValue_(row, ["Enable"]), Enable: true });
    }
  });

  var globalAnnouncements = targetRowsForProvider_(main.announcements, provider);
  var legacyAnnouncements = { status: "available", headers: ["No.", "Value", "Enable"], rows: globalAnnouncements.map(function (row) {
    return { "No.": rowValue_(row, ["No."]), Value: rowValue_(row, ["Value"]), Enable: true };
  }) };
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    refreshSeconds: main.refreshSeconds,
    providerEnabled: provider.enabled,
    pageEnabled: settingEnabled_(main.websiteSettings, "Show WE Page", false),
    offersEnabled: showOffers,
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
    var providerPayload = buildProviderResource_(String(provider.id));
    var section = providerPayload.sections && providerPayload.sections.routers;
    var rows = section && section.enabled ? section.rows : [];
    Array.prototype.push.apply(allRouters, rows || []);
    providerStates.push({ providerId: provider.id, name: provider.name, slug: provider.slug, enabled: provider.enabled, sectionEnabled: Boolean(section && section.enabled), status: section ? section.status : "unavailable" });
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
  var pageEnabled = settingEnabled_(main.websiteSettings, "Show " + provider.name + " Page", false);
  var meta = PROVIDER_META_[String(provider.id)];
  var result = {
    id: provider.id,
    slug: provider.slug,
    name: provider.name,
    enabled: provider.enabled,
    pageEnabled: pageEnabled,
    offersEnabled: false,
    routersEnabled: false,
    sourceStatus: "unavailable",
    status: "unavailable"
  };
  if (!meta || !provider.spreadsheetId) return result;
  try {
    var spreadsheet = SpreadsheetApp.openById(provider.spreadsheetId);
    var page = readTable_(spreadsheet, meta.pageSettings);
    result.offersEnabled = settingEnabled_(page, "Show Offers " + provider.name, false);
    result.routersEnabled = settingEnabled_(page, "Show " + provider.name + " Routers", false);
    var plans = readTable_(spreadsheet, meta.standard);
    result.sourceStatus = planSourceStatus_(plans, visiblePlanRows_(plans));
    if (!provider.enabled) result.status = "disabled";
    else if (!pageEnabled) result.status = "page_disabled";
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
  if (!sheet) return { status: "not_found", sheetName: sheetName, headers: [], rows: [] };
  try {
    var range = sheet.getDataRange();
    var values = range.getValues();
    if (!values || !values.length || !values[0].some(function (value) { return normalizeText_(value) !== ""; })) {
      return { status: "missing_headers", sheetName: sheetName, headers: [], rows: [] };
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
    return { status: "error", sheetName: sheetName, headers: [], rows: [] };
  }
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
    var id = normalizeProviderId_(rowValue_(row, ["Provider_ID"]));
    if (!id) return null;
    return {
      id: Number(id),
      slug: PROVIDER_META_[id] ? PROVIDER_META_[id].slug : "provider-" + id,
      name: normalizeText_(rowValue_(row, ["Provider_Name", "Provider_ Name"])) || "مزوّد " + id,
      enabled: isEnabled_(rowValue_(row, ["Enable"])),
      spreadsheetId: normalizeText_(rowValue_(row, ["Spreadsheet_ID"]))
    };
  }).filter(Boolean).sort(function (a, b) { return a.id - b.id; });
}

function publicProvider_(provider) {
  return { id: provider.id, slug: provider.slug, name: provider.name, enabled: provider.enabled };
}

function findProvider_(providers, id) {
  for (var index = 0; index < providers.length; index += 1) if (String(providers[index].id) === String(id)) return providers[index];
  return null;
}

function publicWebsiteSettings_(table, refreshSeconds) {
  var rows = table && table.rows ? table.rows : [];
  var flags = {};
  rows.forEach(function (row) {
    var key = normalizeText_(rowValue_(row, ["Settings"]));
    if (!key) return;
    flags[key] = isEnabled_(rowValue_(row, ["Enable"]));
  });
  return { status: table ? table.status : "not_inspected", rows: rows, flags: flags, refreshSeconds: refreshSeconds };
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
  if (!table || table.status === "not_applicable") return { status: "not_applicable", rows: [] };
  if (table.status !== "available" && table.status !== "empty") return { status: table.status, rows: [] };
  var rows = (table.rows || []).filter(function (row) {
    return isEnabled_(rowValue_(row, ["Enable"])) && normalizeText_(rowValue_(row, ["Term_Text"])) !== "";
  }).map(function (row) {
    return {
      id: rowValue_(row, ["Term_ID"]),
      text: normalizeText_(rowValue_(row, ["Term_Text"])),
      type: normalizeText_(rowValue_(row, ["Term_Type"])) || "General",
      displayOrder: numberValue_(rowValue_(row, ["Display_Order"]))
    };
  }).sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
  return { status: rows.length ? "available" : "empty", rows: rows };
}

function normalizeRouters_(table, detailsTable, provider, sectionEnabled) {
  if (!sectionEnabled) return { status: "disabled", rows: [] };
  if (!table || (table.status !== "available" && table.status !== "empty")) return { status: table ? table.status : "not_inspected", rows: [] };
  var rows = (table.rows || []).filter(function (row) {
    var routerName = normalizeText_(rowValue_(row, ["Router Name"]));
    var finalPrice = numberValue_(rowValue_(row, ["FInal Price", "Final Price"]));
    return isEnabled_(rowValue_(row, ["Enable"])) && routerName !== "" && isFinite(finalPrice) && finalPrice > 0;
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
      providerId: provider.id,
      providerName: provider.name,
      providerSlug: provider.slug,
      name: normalizeText_(rowValue_(row, ["Router Name"])),
      price: numberValue_(rowValue_(row, ["Price"])),
      increase: numberValue_(rowValue_(row, ["Increase"])),
      finalPrice: finalPrice,
      showOffer: showOffer,
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
  var row = findRow_(table, ["Settings"], "Auto Refresh Seconds");
  var value = row ? numberValue_(rowValue_(row, ["Value"])) : NaN;
  var enabled = row ? isEnabled_(rowValue_(row, ["Enable"])) : false;
  return enabled && isFinite(value) && value >= 5 && value <= 86400 ? Math.floor(value) : DEFAULT_REFRESH_SECONDS_;
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
  var text = normalizeText_(value);
  if (!/^\d+(?:\.0+)?$/.test(text)) return "";
  var id = String(Number(text));
  return PROVIDER_META_[id] ? id : "";
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
