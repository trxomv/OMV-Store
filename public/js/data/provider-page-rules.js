import { normalizeProviderId } from "./provider-adapters.js";

const COMPETITION_PROVIDER_IDS = new Set(["VF", "ORA", "ET"]);
const PUBLIC_COMPETITION_FIELDS = Object.freeze([
  "competitionId",
  "title",
  "benefitType",
  "giftDataGb",
  "giftDuration",
  "durationUnit",
  "startDate",
  "endDate",
  "terms",
  "sortOrder",
]);

export function supportedCompetitionProvider(value) {
  const providerId = normalizeProviderId(value);
  return COMPETITION_PROVIDER_IDS.has(providerId) ? providerId : "";
}

export function competitionRoute(value) {
  const providerId = supportedCompetitionProvider(value);
  return providerId ? `/competitions.html?provider=${encodeURIComponent(providerId)}` : "";
}

export function discountRateVisible(providerValue, pageSettings) {
  const providerId = normalizeProviderId(providerValue);
  // WE's established page uses its own renderer and remains unchanged.
  if (providerId === "TE") return true;
  return COMPETITION_PROVIDER_IDS.has(providerId) && pageSettings?.discountRateEnabled === true;
}

function publicText(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

export function publicCompetitionRows(payload) {
  const providerId = supportedCompetitionProvider(
    payload?.provider?.providerId ?? payload?.provider?.canonicalProviderId ?? payload?.provider?.id,
  );
  if (!providerId || payload?.provider?.enabled !== true || payload?.pageEnabled !== true) return [];
  const section = payload?.sections?.competitions;
  if (section?.enabled !== true || !Array.isArray(section.rows)) return [];

  return section.rows.flatMap((row) => {
    if (!row || typeof row !== "object" || row.enabled !== true) return [];
    const competitionId = publicText(row.competitionId ?? row["Competition ID"]);
    const title = publicText(row.title ?? row["Competition Title"]);
    if (!competitionId || !title) return [];

    const values = {
      competitionId,
      title,
      benefitType: publicText(row.benefitType ?? row.Benefit_Type),
      giftDataGb: publicText(row.giftDataGb ?? row.Gift_Data_GB),
      giftDuration: publicText(row.giftDuration ?? row.Gift_Duration),
      durationUnit: publicText(row.durationUnit ?? row.Duration_Unit),
      startDate: publicText(row.startDate ?? row.Start_Date),
      endDate: publicText(row.endDate ?? row.End_Date),
      terms: publicText(row.terms ?? row.Terms),
      sortOrder: row.sortOrder ?? row.Sort_Order ?? null,
    };
    return [Object.fromEntries(PUBLIC_COMPETITION_FIELDS.map((field) => [field, values[field]]))];
  });
}

export function competitionPageState(payload) {
  if (!payload?.provider || !supportedCompetitionProvider(payload.provider.providerId ?? payload.provider.id)) return "invalid";
  if (payload.provider.enabled !== true || payload.pageEnabled !== true || payload.sections?.competitions?.enabled !== true) return "disabled";
  if (publicCompetitionRows(payload).length) return "available";
  const status = payload.sections?.competitions?.status;
  return status === "empty" || status === "available" ? "empty" : "error";
}
