import { booleanValue, rowValue } from "../data/provider-adapters.js";

const BADGE_FIELDS = Object.freeze({
  first: Object.freeze({
    value: ["First Badge", "FirstBadge", "firstBadge", "first_badge"],
    enabled: ["First Badge Enable", "First Badge Enabled", "Enable First Badge", "Show First Badge", "FirstBadgeEnable", "FirstBadgeEnabled", "firstBadgeEnabled"],
    label: "الشارة الأولى",
    className: "source-badge-slot--first",
  }),
  second: Object.freeze({
    value: ["Second Badge", "SecondBadge", "secondBadge", "second_badge"],
    enabled: ["Second Badge Enable", "Second Badge Enabled", "Enable Second Badge", "Show Second Badge", "SecondBadgeEnable", "SecondBadgeEnabled", "secondBadgeEnabled"],
    label: "الشارة الثانية",
    className: "source-badge-slot--second",
  }),
});

const DISABLED_BADGE_VALUES = new Set([
  "--", "false", "off", "disabled", "no", "لا", "معطل", "معطّل", "غير مفعل", "غير مفعّل",
]);

export function sourceBadgeText(record, position) {
  const config = BADGE_FIELDS[position];
  if (!config || !record || typeof record !== "object") return "";
  const rawValue = rowValue(record, config.value);
  if (rawValue === undefined || rawValue === null || typeof rawValue === "boolean") return "";
  const text = String(rawValue).trim();
  if (!text || DISABLED_BADGE_VALUES.has(text.normalize("NFKC").toLowerCase())) return "";
  const enabled = rowValue(record, config.enabled);
  if (enabled !== undefined && !booleanValue(enabled, false)) return "";
  return text;
}

export function providerFirstBadgeText(record) {
  const first = sourceBadgeText(record, "first");
  if (first) return first;
  if (!record || typeof record !== "object") return "";
  const splitFields = [
    ...BADGE_FIELDS.first.value,
    ...BADGE_FIELDS.first.enabled,
    ...BADGE_FIELDS.second.value,
    ...BADGE_FIELDS.second.enabled,
  ];
  if (splitFields.some((field) => rowValue(record, [field]) !== undefined)) return "";
  return sourceBadgeText({ "First Badge": rowValue(record, ["Badge", "Badges", "Badge Text"]) }, "first");
}

export function createSourceBadgeSlot(record, position) {
  const text = sourceBadgeText(record, position);
  const config = BADGE_FIELDS[position];
  if (!text || !config) return null;
  const slot = document.createElement("div");
  slot.className = `source-badge-slot ${config.className}`;
  slot.setAttribute("dir", "ltr");
  const badge = document.createElement("span");
  badge.className = "source-badge-chip";
  badge.textContent = text;
  badge.setAttribute("dir", "auto");
  badge.setAttribute("aria-label", `${config.label}: ${text}`);
  slot.append(badge);
  return slot;
}
