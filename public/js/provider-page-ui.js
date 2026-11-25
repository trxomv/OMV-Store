import { booleanValue, finiteNumber, normalizeContact, normalizeProviderId, rowValue, visiblePlanRows } from "./data/provider-adapters.js";

export const PROVIDER_VISUALS = Object.freeze({
  VF: Object.freeze({ header: "assets/provider-headers/Vodafone-header.png", logo: "assets/providers-logos/vodafone.svg", color: "#ff5562" }),
  TE: Object.freeze({ header: "assets/provider-headers/we-header.png", logo: "assets/providers-logos/we.svg", color: "#b46cff" }),
  ORA: Object.freeze({ header: "assets/provider-headers/orange-header.png", logo: "assets/providers-logos/orange.svg", color: "#ff9c33" }),
  ET: Object.freeze({ header: "assets/provider-headers/etisalat-header.png", logo: "assets/providers-logos/etisalat.svg", color: "#ff5562" }),
});

export function providerVisual(identity) {
  return PROVIDER_VISUALS[normalizeProviderId(identity?.canonicalId || identity?.id)] || null;
}

function normalizedStatus(row) {
  return String(rowValue(row, ["Availability", "Availability Status", "Status", "Plan Status"]) ?? "")
    .trim().toLowerCase().replace(/[\s_-]+/g, "_");
}

export function planAvailability(row) {
  const status = normalizedStatus(row);
  const soldOut = booleanValue(rowValue(row, ["Sold Out", "SoldOut", "Out of Stock"]), false);
  const available = rowValue(row, ["Available", "Is Available", "In Stock"]);
  if (soldOut || ["sold_out", "soldout", "out_of_stock", "unavailable", "disabled", "not_available"].includes(status) || (available !== undefined && !booleanValue(available, false))) {
    return { available: false, label: "غير متاحة حاليًا", reason: "sold-out" };
  }
  return { available: true, label: "متاحة الآن", reason: "available" };
}

export function providerPlanRows(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const validRows = new Set(visiblePlanRows(table));
  return rows.filter((row) => {
    const show = rowValue(row, ["Show Rate Plan", "Show"]);
    if (show === undefined || !booleanValue(show, false)) return false;
    return validRows.has(row) || !planAvailability(row).available;
  });
}

export function whatsappPhone(contacts, provider) {
  const contact = (contacts || []).map((item) => normalizeContact(item, provider)).find((item) => item?.type === "whatsapp number");
  return contact?.href?.match(/wa\.me\/(\d{8,15})/i)?.[1] || "";
}

export function whatsappPlanHref(phone, details = "") {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) return "";
  return `https://wa.me/${digits}${details ? `?text=${encodeURIComponent(details)}` : ""}`;
}

export function hasCompletePlanFacts(row) {
  const quota = finiteNumber(rowValue(row, ["MBs", "MB", "Megabytes", "GBs", "GB"]));
  const price = finiteNumber(rowValue(row, ["Final Price", "FInal Price", "Final Price (EGP)"]));
  return quota !== null && quota > 0 && price !== null && price > 0;
}
