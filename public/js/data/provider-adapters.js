const PROVIDER_LABELS = Object.freeze({
  1: { name: "Vodafone", nameAr: "فودافون", slug: "vodafone" },
  2: { name: "WE", nameAr: "وي", slug: "we" },
  3: { name: "Orange", nameAr: "أورنج", slug: "orange" },
  4: { name: "Etisalat", nameAr: "اتصالات", slug: "etisalat" },
});

export function booleanValue(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (["true", "1", "yes", "y", "نعم", "مفعل", "مفعّل", "نشط", "نشطة"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "لا", "معطل", "معطّل", "غير مفعل", "غير مفعّل"].includes(normalized)) return false;
  return fallback;
}

export function providerIdentity(id, name = "") {
  const numericId = Number(id);
  const known = PROVIDER_LABELS[numericId];
  return known ? { id: numericId, ...known, sourceName: name || known.name } : {
    id: numericId,
    name: name || `Provider ${numericId}`,
    nameAr: name || `مزوّد ${numericId}`,
    slug: `provider-${numericId}`,
    sourceName: name,
  };
}

export function providerState(provider = {}) {
  if (provider.enabled === undefined || provider.enabled === null || provider.enabled === "") return "empty";
  if (!booleanValue(provider.enabled, false)) return "disabled";
  if (provider.pageEnabled === false || provider.status === "page_disabled") return "page_disabled";
  if (provider.offersEnabled === false || provider.status === "offers_disabled") return "offers_disabled";
  const sourceState = provider.sourceStatus || provider.status;
  if (["unavailable", "inaccessible", "error", "unsupported_schema", "not_found", "missing_headers"].includes(sourceState)) return "unavailable";
  if (["empty", "no_data", "not_inspected"].includes(sourceState)) return sourceState === "not_inspected" ? "unavailable" : "empty";
  return provider.status || "available";
}

export function providerStateLabel(state) {
  return ({
    available: "متاحة الآن",
    disabled: "قريبًا",
    page_disabled: "الصفحة غير مفعّلة",
    offers_disabled: "العروض غير مفعّلة",
    empty: "قريبًا",
    unavailable: "تعذر تحميل البيانات",
    inaccessible: "المصدر غير متاح",
    unsupported_schema: "المصدر قيد التجهيز",
  })[state] || "قريبًا";
}

export function rowEnabled(row, aliases = ["Enable", "Enabled", "Active"]) {
  const map = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]));
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (map.has(key)) return booleanValue(map.get(key), false);
  }
  return false;
}

export function rowValue(row, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row || {})) if (wanted.has(normalizeHeader(key))) return value;
  return undefined;
}

export function normalizeHeader(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim().toLowerCase().replace(/[.]/g, "").replace(/[\s-]+/g, "_");
}

export function visiblePlanRows(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  return rows.filter((row) => {
    const visibility = rowValue(row, ["Show Rate Plan", "Show"]);
    if (visibility === undefined || !booleanValue(visibility, false)) return false;
    const planId = rowValue(row, ["No. of Plan", "No of Plan", "Plan ID", "Package ID"]);
    const quota = finiteNumber(rowValue(row, ["MBs", "MB", "Megabytes", "GBs", "GB"]));
    const price = finiteNumber(rowValue(row, ["Final Price", "FInal Price", "Final Price (EGP)"]));
    if (planId === undefined || String(planId).trim() === "" || quota === null || quota <= 0 || price === null || price <= 0) return false;
    const minutesValue = rowValue(row, ["Minutes", "Minute"]);
    if (minutesValue !== undefined) {
      const minutes = finiteNumber(minutesValue);
      if (minutes === null || minutes < 0) return false;
    }
    return true;
  });
}

export function offerForPlan(row, globalOffersEnabled = true) {
  if (!globalOffersEnabled || !rowEnabled(row, ["Show Offer"])) return null;
  const finalPrice = finiteNumber(rowValue(row, ["Final Price", "FInal Price"]));
  const offerPrice = finiteNumber(rowValue(row, ["Offer Price", "Discount Price", "Discounted Price"]));
  const discountPercent = finiteNumber(rowValue(row, ["Discount Percent", "Discount %", "Discount Rate"]));
  if (offerPrice === null && discountPercent === null) return null;
  return { finalPrice, offerPrice, discountPercent };
}

export function normalizeTerms(source) {
  const status = source?.status || "not_inspected";
  if (!["available", "empty"].includes(status)) return { status, rows: [] };
  const rows = (source.rows || []).map((row) => {
    const text = String(rowValue(row, ["text", "Term_Text"]) ?? "").trim();
    if (!text) return null;
    const hasEnableFlag = Object.keys(row || {}).some((key) => ["enable", "enabled", "active"].includes(normalizeHeader(key)));
    if (hasEnableFlag && !rowEnabled(row)) return null;
    const order = finiteNumber(rowValue(row, ["displayOrder", "Display_Order"])) ?? 0;
    return {
      id: rowValue(row, ["id", "Term_ID"]) ?? "",
      text,
      type: String(rowValue(row, ["type", "Term_Type"]) || "General").trim(),
      displayOrder: order,
    };
  }).filter(Boolean).sort((a, b) => a.displayOrder - b.displayOrder);
  return { status: rows.length ? "available" : "empty", rows };
}

export function targetMatchesProvider(target, provider) {
  const normalized = normalizeTarget(target);
  if (normalized === "all") return true;
  const identity = providerIdentity(provider?.id, provider?.name);
  return [identity.slug, identity.name.toLowerCase(), `provider:${identity.id}`].includes(normalized);
}

export function normalizeContact(contact, provider = null) {
  if (!rowEnabled(contact)) return null;
  const target = normalizeTarget(rowValue(contact, ["Target", "target"]));
  if (target !== "all" && (!provider || !targetMatchesProvider(target, provider))) return null;
  const type = String(rowValue(contact, ["Contact Type", "type", "id"]) ?? "").trim().toLowerCase();
  const raw = String(rowValue(contact, ["Value", "value"]) ?? "").trim();
  let href = "";
  if (type === "whatsapp number") {
    if (/^https:\/\/wa\.me\/\d{8,15}\/?$/i.test(raw)) href = raw;
    else {
      let digits = raw.replace(/\D/g, "");
      if (/^01\d{9}$/.test(digits)) digits = `2${digits}`;
      if (/^20\d{10}$/.test(digits) || /^\d{10,15}$/.test(digits)) href = `https://wa.me/${digits}`;
    }
  } else if (type === "whatsapp group") {
    href = trustedHttps(raw, "chat.whatsapp.com");
  } else if (type === "telegram group" || type === "telegram number") {
    if (/^@[A-Za-z0-9_]{4,}$/u.test(raw)) href = `https://t.me/${raw.slice(1)}`;
    else href = trustedHttps(raw, "t.me");
  }
  const order = finiteNumber(rowValue(contact, ["Sort Order", "Order"])) ?? 0;
  return href ? { id: String(rowValue(contact, ["Contact ID", "id"]) || type), type, href, label: contactLabel(type), target, enabled: true, order } : null;
}

export function normalizePayment(payment) {
  if (!rowEnabled(payment)) return null;
  const source = String(rowValue(payment, ["Payment Method", "Method", "label"]) ?? "").trim();
  if (!source) return null;
  const normalized = source.toLowerCase().replace(/[\s_-]+/g, " ");
  const entries = [
    ["instapay", "InstaPay", "assets/payment-methods/instapay.webp"],
    ["telda", "Telda", "assets/payment-methods/telda.webp"],
    ["vodafone cash", "Vodafone Cash", "assets/payment-methods/vodafone-cash.webp"],
    ["orange cash", "Orange Cash", "assets/payment-methods/orange-cash.webp"],
    ["etisalat cash", "Etisalat Cash", "assets/payment-methods/etisalat-money.webp"],
    ["etisalat money", "Etisalat Money", "assets/payment-methods/etisalat-money.webp"],
  ];
  const known = entries.find(([needle]) => normalized.includes(needle));
  return known ? { id: known[1].toLowerCase().replace(/\s+/g, "-"), label: known[1], asset: known[2], enabled: true } : { id: `sheet-${normalized.replace(/[^a-z0-9]+/g, "-")}`, label: source, asset: "", enabled: true };
}

export function visibleAnnouncements(items, target = "All") {
  const wanted = normalizeTarget(target);
  return (items || []).filter((item) => rowEnabled(item) && normalizeTarget(rowValue(item, ["Target", "target"])) === wanted && String(rowValue(item, ["Value", "text"]) ?? "").trim())
    .sort((a, b) => announcementOrder(a) - announcementOrder(b));
}

export function providerAnnouncements(items, provider) {
  return (items || []).filter((item) => rowEnabled(item) && targetMatchesProvider(rowValue(item, ["Target", "target"]), provider) && String(rowValue(item, ["Value", "text"]) ?? "").trim())
    .sort((a, b) => announcementOrder(a) - announcementOrder(b));
}

export function routerAnnouncements(items) {
  const routerTargets = new Set(["router", "routers", "all routers"]);
  return (items || []).filter((item) => rowEnabled(item) && routerTargets.has(normalizeTarget(rowValue(item, ["Target", "target"]))) && String(rowValue(item, ["Value", "text"]) ?? "").trim())
    .sort((a, b) => announcementOrder(a) - announcementOrder(b));
}

export function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬,]/g, "").replace(/٫/g, ".").replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTarget(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function announcementOrder(item) {
  return finiteNumber(rowValue(item, ["No.", "No", "Number", "Order", "order"])) ?? 0;
}

function trustedHttps(value, host) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === host && url.pathname.length > 1 ? url.href : "";
  } catch {
    return "";
  }
}

function contactLabel(type) {
  return ({ "whatsapp number": "واتساب", "whatsapp group": "مجموعة واتساب", "telegram group": "مجموعة تيليجرام", "telegram number": "تيليجرام" })[type] || "تواصل";
}
