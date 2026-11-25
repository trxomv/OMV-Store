/**
 * Phase 03 provider and spreadsheet adapter layer.
 * Pure/read-only utilities only. This file does not write to Sheets or expose IDs.
 */
var API_ERROR_CODES_ = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNKNOWN_PROVIDER: "UNKNOWN_PROVIDER",
  UNKNOWN_RESOURCE: "UNKNOWN_RESOURCE",
  MISSING_SPREADSHEET: "MISSING_SPREADSHEET",
  MISSING_WORKSHEET: "MISSING_WORKSHEET",
  UNSUPPORTED_SCHEMA: "UNSUPPORTED_SCHEMA",
  INVALID_DATA: "INVALID_DATA",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR"
};

var PROVIDER_REGISTRY_ = {
  VF: {
    providerId: "VF", legacyRouteId: 1, slug: "vodafone", name: "Vodafone",
    workbookResources: {
      packages: { mobile: "Mobile_Rate_Plans", home: "@Home_Rate_Plans" },
      routers: "VF-Routers", routerDetails: "VF-Routers_Details", providerSettings: "VF-Page Settings",
      competitions: "VF-Competitions", providerTerms: "VF-Terms&Conditions"
    },
    legacySheets: { standard: ["Mobile_Rate Plans-Website"], routers: ["Vodafone-Routers"], routerDetails: ["Vodafone-Routers_Details"], pageSettings: ["Page Settings"], terms: ["Terms&Conditions"] },
    routerVisibilityHeader: "Show Router",
    settings: {
      page: "Show Vodafone Page", offers: "Show Vodafone Offers", discountRate: "Show Discount Rate",
      routers: "Show Vodafone Routers", competitions: "Show Vodafone Competitions"
    }
  },
  TE: {
    providerId: "TE", legacyRouteId: 2, slug: "we", name: "WE",
    workbookResources: {
      packages: { mobile: "Mobile_Rate_Plans", home: "TE-Air_Rate_Plans", eom: "Mobile_Plans_2_EOM", to15: "Mobile_Plans_2_15", air: "TE-Air_Rate_Plans" },
      customPricing: "Custom Pricing", addons: "Add-on", routers: "TE-Routers", routerDetails: "TE-Routers_Details",
      providerSettings: "TE-Page Settings", competitions: "TE-Competitions", providerTerms: "TE-Terms&Conditions"
    },
    legacySheets: { standard: ["Mobile_Rate Plans-Website"], eom: ["Mobile_Plans to EOM-Website"], to15: ["Mobile_Plans to 15-Website"], air: ["WE-Air_Rate Plans-Website"], routers: ["WE-Routers"], routerDetails: ["WE-Routers_Details"], pageSettings: ["Page Settings"], terms: ["We-Terms&Conditions"] },
    routerVisibilityHeader: "Show Router",
    settings: {
      page: null, offers: "Show Offers WE", discountRate: null, routers: "Show WE Routers",
      eom: "Show to EOM", to15: "Show to 15", competitions: "Show WE Competitions",
      customRatePlansFrom1: "Custom Rate Plans From 1", customRatePlansFrom16: "Custom Rate Plans From 16"
    }
  },
  ORA: {
    providerId: "ORA", legacyRouteId: 3, slug: "orange", name: "Orange",
    workbookResources: {
      packages: { mobile: "Mobile_Rate_Plans", home: "Home_Wir_Rate_Plans" },
      routers: "ORA-Routers", routerDetails: "ORA-Routers_Details", providerSettings: "ORA-Page Settings",
      competitions: "ORA-Competitions", providerTerms: "ORA-Terms&Conditions"
    },
    legacySheets: { standard: ["Mobile_Rate Plans-Website"], routers: ["Orange-Routers"], routerDetails: ["Orange-Routers_Details"], pageSettings: ["Page Settings"], terms: ["Orange-Terms&Conditions"] },
    routerVisibilityHeader: "Show Router",
    settings: {
      page: "Show Orange Page", offers: "Show Orange Offers", discountRate: "Show Discount Rate",
      routers: "Show Orange Routers", competitions: "Show Orange Competitions"
    }
  },
  ET: {
    providerId: "ET", legacyRouteId: 4, slug: "etisalat", name: "Etisalat",
    workbookResources: {
      packages: { mobile: "Mobile_Rate_Plans", home: "eHome_Rate_Plans" },
      routers: "ET-Routers", routerDetails: "ET-Routers_Details", providerSettings: "ET-Page Settings",
      competitions: "ET-Competitions", providerTerms: "Etisalat-Terms&Conditions"
    },
    legacySheets: { standard: ["Mobile_Rate Plans-Website"], routers: ["Etisalat-Routers"], routerDetails: ["Etisalat-Routers_Details"], pageSettings: ["Page Settings"], terms: ["Etisalat-Terms&Conditions"] },
    routerVisibilityHeader: "Show Router",
    settings: {
      page: "Show Etisalat Page", offers: "Show Etisalat Offers", discountRate: "Show Discount Rate",
      routers: "Show Etisalat Routers", competitions: "Show Etisalat Competitions"
    }
  }
};

var MAIN_RESOURCE_WORKSHEETS_ = {
  providers: "Telecom Providers", categories: "Main Categories", routerOffers: "Router Offers", masterPlans: "Master_Plans",
  websiteSettings: "Website Settings", socialMedia: "Social Media", paymentMethods: "Payment Methods", announcements: "Announcements",
  siteTerms: "OMV-Terms&Conditions", terms: "Terms&Conditions"
};
var COMPETITION_ENTRIES_MAPPING_ = { resource: "competitionEntries", spreadsheetProperty: "OMV_COMPETITION_ENTRIES_ID", worksheet: "Competition Entries" };
var REFRESH_SETTING_ALIASES_ = {
  autoDataRefresh: ["Auto Data Refresh"],
  competitionChangeCheckSeconds: ["Competitions Change Check (Seconds)", "Competition Change Check (Seconds)"],
  generalDataChangeCheckSeconds: ["General Data Change Check (Seconds)"]
};

function providerRegistry_() { return PROVIDER_REGISTRY_; }
function getProviderById_(value) {
  var id = getCanonicalProviderId_(value);
  return id ? PROVIDER_REGISTRY_[id] : null;
}
function getProviderByLegacyRouteId_(value) {
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number) return null;
  var ids = Object.keys(PROVIDER_REGISTRY_);
  for (var i = 0; i < ids.length; i += 1) if (PROVIDER_REGISTRY_[ids[i]].legacyRouteId === number) return PROVIDER_REGISTRY_[ids[i]];
  return null;
}
function getCanonicalProviderId_(value) {
  var text = normalizeText_(value).toUpperCase();
  if (PROVIDER_REGISTRY_[text]) return text;
  var legacy = getProviderByLegacyRouteId_(text);
  return legacy ? legacy.providerId : "";
}
function providerAdapter_(providerId) { return getProviderById_(providerId); }
function providerLegacyId_(providerId) { var provider = getProviderById_(providerId); return provider ? provider.legacyRouteId : null; }

function logicalWorksheet_(providerId, logicalResource) {
  var adapter = providerAdapter_(providerId);
  if (!adapter) return adapterError_("UNKNOWN_PROVIDER", "Unknown provider identifier.");
  var mapping = adapter.workbookResources;
  var value = mapping[logicalResource];
  if (logicalResource === "terms") value = mapping.providerTerms;
  if (logicalResource === "providerSettings") value = mapping.providerSettings;
  if (logicalResource === "standard") value = mapping.packages.mobile;
  if (["home", "mobile", "eom", "to15", "air"].indexOf(logicalResource) >= 0) value = mapping.packages[logicalResource] || (logicalResource === "home" ? mapping.packages.air : "");
  if (!value) return adapterError_("UNKNOWN_RESOURCE", "Unknown provider resource.");
  return { providerId: adapter.providerId, logicalResource: logicalResource, physicalWorksheet: value, visibilityHeader: logicalResource === "routers" ? adapter.routerVisibilityHeader : null };
}
function logicalMainWorksheet_(resource) {
  var physical = MAIN_RESOURCE_WORKSHEETS_[resource];
  return physical ? { logicalResource: resource, physicalWorksheet: physical } : adapterError_("UNKNOWN_RESOURCE", "Unknown main resource.");
}
function resolveWorksheetName_(spreadsheet, preferredName, legacyNames) {
  var candidates = [preferredName].concat(legacyNames || []);
  for (var i = 0; i < candidates.length; i += 1) if (candidates[i] && spreadsheet.getSheetByName(candidates[i])) return candidates[i];
  return preferredName || (legacyNames && legacyNames[0]) || "";
}
function readMappedTable_(spreadsheet, providerId, logicalResource) {
  var adapter = providerAdapter_(providerId);
  if (!adapter) return structuredTableError_("UNKNOWN_PROVIDER");
  var lookupResource = logicalResource === "pageSettings" ? "providerSettings" : logicalResource;
  var mapping = logicalWorksheet_(providerId, lookupResource);
  if (mapping.error) return structuredTableError_(mapping.error.code);
  var legacyNames = adapter.legacySheets[logicalResource] || adapter.legacySheets[lookupResource] || [];
  return validateMappedTable_(readTable_(spreadsheet, resolveWorksheetName_(spreadsheet, mapping.physicalWorksheet, legacyNames)), lookupResource);
}
function readMappedMainTable_(spreadsheet, logicalResource, legacyNames) {
  var mapping = logicalMainWorksheet_(logicalResource);
  if (mapping.error) return structuredTableError_(mapping.error.code);
  return validateMappedTable_(readTable_(spreadsheet, resolveWorksheetName_(spreadsheet, mapping.physicalWorksheet, legacyNames || [])), logicalResource);
}
var RESOURCE_SCHEMA_DEFINITIONS_ = {
  routerOffers: { required: [], status: "not_established", reason: "The delivered Phase 02 artifacts define the logical resource and mapping but do not include an authoritative physical header list." },
  masterPlans: { required: [], status: "not_established", reason: "The delivered Phase 02 artifacts define the logical resource and mapping but do not include an authoritative physical header list." }
};
function requiredHeadersForResource_(logicalResource) {
  var requirements = {
    providers: ["Provider_ID", "Spreadsheet_ID", "Enable"],
    categories: ["Category ID", "Enable"],
    websiteSettings: ["Settings", "Enable"],
    providerSettings: ["Settings", "Enable"],
    pageSettings: ["Settings", "Enable"],
    routers: ["Router ID", "Router Name"],
    routerDetails: ["Router ID"],
      terms: ["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"],
      competitions: ["Competition ID", "Competition Title", "Enable"],
      standard: ["Plan_ID", "Plan-Name", "MBs", "Final Price", "Show Rate Plan"],
      home: ["Plan_ID", "Plan-Name", "GBs", "Final Price", "Show Rate Plan"],
      air: ["Plan_ID", "Plan-Name", "GBs", "Final Price", "Show Rate Plan"],
      eom: ["Plan_ID", "Plan-Name", "MBs", "Final Price", "Show"],
      to15: ["Plan_ID", "Plan-Name", "MBs", "Final Price", "Show"],
      routers: ["Router ID", "Router Name", "FInal Price", "Show Router"],
      providerTerms: ["Term_ID", "Term_Text", "Term_Type", "Enable", "Display_Order"]
  };
  return requirements[logicalResource] || (RESOURCE_SCHEMA_DEFINITIONS_[logicalResource] ? RESOURCE_SCHEMA_DEFINITIONS_[logicalResource].required : []);
}
function validateMappedTable_(table, logicalResource) {
  var required = requiredHeadersForResource_(logicalResource);
  if (!table || table.status === "not_found" || table.status === "not_applicable" || table.status === "error") return table;
  var validation = validateHeaders_(table, required, ["Term_Titel", "Show Offer", "Show Router", "Enable"]);
  var definition = RESOURCE_SCHEMA_DEFINITIONS_[logicalResource];
  if (definition && definition.status === "not_established") {
    table.schema = { status: definition.status, reason: definition.reason, required: [] };
  }
  if (!validation.ok) {
    table.status = "unsupported_schema";
    table.errorCode = "UNSUPPORTED_SCHEMA";
    table.schema = { status: definition && definition.status === "not_established" ? definition.status : "invalid", missing: validation.missing, duplicate: validation.duplicate, reason: definition ? definition.reason : null };
  }
  return table;
}
function structuredTableError_(code) { return { status: code === "MISSING_WORKSHEET" ? "not_found" : "unsupported_schema", errorCode: code, headers: [], rows: [] }; }
function adapterError_(code, message) { return { error: { code: code, message: message } }; }

function normalizeHeaderLookup_(value) { return normalizeText_(value).normalize("NFKC").toLowerCase().replace(/[.]/g, "").replace(/[\s-]+/g, "_"); }
function headerIndexes_(headers) {
  var indexes = {};
  (headers || []).forEach(function (header, index) {
    var key = normalizeHeaderLookup_(header);
    if (!key) return;
    if (indexes[key] !== undefined) indexes[key] = -1;
    else indexes[key] = index;
  });
  return indexes;
}
function validateHeaders_(table, requiredHeaders, optionalHeaders) {
  var headers = table && table.headers ? table.headers : [];
  var indexes = headerIndexes_(headers);
  var missing = (requiredHeaders || []).filter(function (header) { return indexes[normalizeHeaderLookup_(header)] === undefined; });
  var duplicate = Object.keys(indexes).filter(function (key) { return indexes[key] === -1; });
  if (missing.length || duplicate.length) return { ok: false, code: "UNSUPPORTED_SCHEMA", missing: missing, duplicate: duplicate, optional: optionalHeaders || [] };
  return { ok: true, indexes: indexes, optional: optionalHeaders || [] };
}
function canonicalTerms_(table, isMainTerms) {
  if (!table || (table.status !== "available" && table.status !== "empty")) return { status: table ? table.status : "not_inspected", rows: [] };
  var rows = (table.rows || []).filter(function (row) { return isEnabled_(rowValue_(row, ["Enable"])) && normalizeText_(rowValue_(row, ["Term_Text"])) !== ""; }).map(function (row) {
    return { id: rowValue_(row, ["Term_ID"]), title: isMainTerms ? (hasValue_(rowValue_(row, ["Term_Titel"])) ? normalizeText_(rowValue_(row, ["Term_Titel"])) : null) : null, text: normalizeText_(rowValue_(row, ["Term_Text"])), type: normalizeText_(rowValue_(row, ["Term_Type"])), enabled: true, displayOrder: numberValue_(rowValue_(row, ["Display_Order"])) };
  });
  rows.sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
  return { status: rows.length ? "available" : "empty", rows: rows };
}
function readRefreshConfiguration_(table) {
  var result = {
    autoDataRefresh: false,
    competitionChangeCheckSeconds: null,
    generalDataChangeCheckSeconds: null,
    enabled: { autoDataRefresh: false, competitionChangeCheckSeconds: false, generalDataChangeCheckSeconds: false },
    effective: { autoDataRefresh: false, competitionChangeCheckSeconds: null, generalDataChangeCheckSeconds: null },
    conflicts: [],
    diagnostics: []
  };
  var rows = table && table.rows ? table.rows : [];
  Object.keys(REFRESH_SETTING_ALIASES_).forEach(function (key) {
    var matches = rows.filter(function (row) { return REFRESH_SETTING_ALIASES_[key].some(function (alias) { return normalizeHeaderLookup_(rowValue_(row, ["Settings"])) === normalizeHeaderLookup_(alias); }); });
    if (!matches.length) return;
    var plural = matches.filter(function (row) { return normalizeHeaderLookup_(rowValue_(row, ["Settings"])) === normalizeHeaderLookup_(REFRESH_SETTING_ALIASES_[key][0]); });
    var selected = plural.length ? plural[0] : matches[0];
    var values = matches.map(function (row) { return key === "autoDataRefresh" ? isEnabled_(rowValue_(row, ["Value"])) : numberValue_(rowValue_(row, ["Value"])); });
    if (values.some(function (value) { return value !== values[0]; })) {
      result.conflicts.push(key);
      result.diagnostics.push({ code: "REFRESH_SETTING_CONFLICT", setting: key });
    }
    var selectedValue = key === "autoDataRefresh" ? isEnabled_(rowValue_(selected, ["Value"])) : numberValue_(rowValue_(selected, ["Value"]));
    result[key] = key === "autoDataRefresh" ? selectedValue : (isFinite(selectedValue) && selectedValue > 0 ? Math.floor(selectedValue) : null);
    result.enabled[key] = isEnabled_(rowValue_(selected, ["Enable"]));
  });
  result.effective.autoDataRefresh = result.enabled.autoDataRefresh && result.autoDataRefresh === true;
  ["competitionChangeCheckSeconds", "generalDataChangeCheckSeconds"].forEach(function (key) {
    result.effective[key] = result.effective.autoDataRefresh && result.enabled[key] && isFinite(result[key]) && result[key] > 0 ? result[key] : null;
  });
  return result;
}
function normalizeEgyptianMobile_(value) {
  var original = value;
  if (value === null || value === undefined) return { ok: false, code: "INVALID_PHONE", value: null };
  var text = normalizeText_(value).replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(text)) return { ok: false, code: "INVALID_PHONE", value: null };
  if (text.indexOf("+") === 0) text = text.slice(1);
  if (text.indexOf("00") === 0) text = text.slice(2);
  if (/^01[0125]\d{8}$/.test(text)) text = "20" + text.slice(1);
  if (!/^201[0125]\d{8}$/.test(text)) return { ok: false, code: "INVALID_PHONE", value: null };
  return { ok: true, value: text, original: original };
}
function canonicalResponse_(resource, data, generatedAt, version) { return { success: true, apiVersion: 2, resource: resource, generatedAt: generatedAt || null, version: version || null, data: data || {}, errors: [] }; }
function canonicalErrorResponse_(resource, code, message) { return { success: false, apiVersion: 2, resource: resource, data: null, errors: [{ code: code, message: message || "The requested data could not be normalized." }] }; }
