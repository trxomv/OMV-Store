const SNAPSHOT_URL = "data/preview-snapshot.json";
const CACHE_PREFIX = "omv:v2:";
const API_TIMEOUT_MS = 18000;
const inflightRequests = new Map();

function safeCentralEndpoint(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).trim(), document.baseURI);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return "";
    if (url.hostname.toLowerCase() !== "script.google.com") return "";
    if (!/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function configuredEndpoint() {
  return safeCentralEndpoint(window.OMV_SITE_CONFIG?.centralApiEndpoint ?? window.WE_SITE_CONFIG?.centralApiEndpoint);
}

function requestJsonp(endpoint, resource, providerId) {
  return new Promise((resolve, reject) => {
    const callbackName = `__omvApi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(endpoint);
    url.searchParams.set("resource", resource);
    if (providerId !== undefined && providerId !== null) url.searchParams.set("id", String(providerId));
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", String(Date.now()));
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error("timeout")), API_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timer);
      script.remove();
      try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
    }
    function finish(error, payload) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (!isExpectedResource(payload, resource)) reject(new Error("invalid-api-response"));
      else resolve(withoutRawCompetitionTable(resource, payload));
    }

    window[callbackName] = (payload) => finish(null, payload);
    script.async = true;
    script.onerror = () => finish(new Error("api-unavailable"));
    script.src = url.href;
    document.head.append(script);
  });
}

function isExpectedResource(payload, resource) {
  if (!payload || payload.ok !== true || payload.resource !== resource) return false;
  if (resource === "site") return Array.isArray(payload.providers) && payload.settings && Array.isArray(payload.contacts);
  if (resource === "provider") return payload.provider && payload.sections && payload.tables;
  if (resource === "routers") return Array.isArray(payload.routers) && Array.isArray(payload.providers);
  return false;
}

function withoutRawCompetitionTable(resource, payload) {
  if (resource !== "provider" || !payload?.tables || !Object.prototype.hasOwnProperty.call(payload.tables, "competitions")) return payload;
  const tables = { ...payload.tables };
  delete tables.competitions;
  return { ...payload, tables };
}

function cacheKey(resource, providerId) {
  return `${CACHE_PREFIX}${resource}:${providerId ?? "all"}`;
}

function readCache(resource, providerId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(cacheKey(resource, providerId)) || "null");
    if (value?.payload?.ok !== true) return null;
    const payload = withoutRawCompetitionTable(resource, value.payload);
    if (payload !== value.payload) {
      window.localStorage.setItem(cacheKey(resource, providerId), JSON.stringify({ ...value, payload }));
    }
    return payload;
  } catch {
    return null;
  }
}

function writeCache(resource, providerId, payload) {
  try {
    const safePayload = withoutRawCompetitionTable(resource, payload);
    window.localStorage.setItem(cacheKey(resource, providerId), JSON.stringify({ savedAt: Date.now(), payload: safePayload }));
  } catch {}
}

async function readSnapshot(resource, providerId) {
  const response = await fetch(SNAPSHOT_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Preview snapshot unavailable: ${response.status}`);
  const snapshot = await response.json();
  if (snapshot.schemaVersion !== 1 || snapshot.sourceMode !== "snapshot") throw new Error("Unsupported preview snapshot");
  let payload;
  if (resource === "site") payload = snapshot.site;
  else if (resource === "routers") payload = snapshot.routers;
  else if (resource === "provider") payload = snapshot.providers?.[String(providerId)];
  else throw new Error("Unknown OMV resource");
  if (!payload || payload.ok !== true) throw new Error("Preview snapshot resource unavailable");
  return { payload, snapshotAt: snapshot.snapshotAt || payload.generatedAt, notice: snapshot.notice || "لقطة معاينة ثابتة؛ ليست بيانات مباشرة." };
}

async function loadResourceUncached(resource, providerId) {
  const endpoint = configuredEndpoint();
  if (endpoint) {
    try {
      const payload = await requestJsonp(endpoint, resource, providerId);
      writeCache(resource, providerId, payload);
      return { payload, sourceMode: "live", stale: false, snapshotAt: "", notice: "" };
    } catch {
      const cached = readCache(resource, providerId);
      if (cached) return { payload: cached, sourceMode: "cache", stale: true, snapshotAt: cached.generatedAt || "", notice: "تعذر الاتصال بالمصدر الحي؛ هذه آخر بيانات محفوظة محليًا وقد تكون قديمة." };
      const fallback = await readSnapshot(resource, providerId);
      return { ...fallback, sourceMode: "snapshot", stale: false };
    }
  }
  const fallback = await readSnapshot(resource, providerId);
  return { ...fallback, sourceMode: "snapshot", stale: false };
}

/**
 * Load one central resource. A configured endpoint must return the OMV contract;
 * legacy WE-only responses are rejected and safely fall back to cache/snapshot.
 * Concurrent callers requesting the same resource share one request/payload.
 */
export function loadResource(resource, providerId = null) {
  const key = cacheKey(resource, providerId);
  if (inflightRequests.has(key)) return inflightRequests.get(key);
  const request = loadResourceUncached(resource, providerId).finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, request);
  return request;
}

export function renderSourceBanner(element, result) {
  if (!element) return;
  if (!result || result.sourceMode === "live") {
    element.hidden = true;
    element.textContent = "";
    return;
  }
  element.hidden = false;
  element.dataset.mode = result.sourceMode;
  element.textContent = result.notice || (result.sourceMode === "snapshot"
    ? "هذه لقطة معاينة ثابتة وليست بيانات مباشرة."
    : "البيانات المحفوظة محليًا قد تكون قديمة.");
}

export function refreshSeconds(payload, fallback = 15) {
  if (payload?.refreshConfiguration?.effective?.autoDataRefresh === false
    || payload?.settings?.effectiveRefresh?.autoDataRefresh === false
    || payload?.settings?.flags?.["Auto Data Refresh"] === false) return 0;
  const hasTopLevel = Object.prototype.hasOwnProperty.call(payload ?? {}, "refreshSeconds");
  const hasSettings = Object.prototype.hasOwnProperty.call(payload?.settings ?? {}, "refreshSeconds");
  const explicit = hasTopLevel || hasSettings;
  const raw = hasTopLevel ? payload.refreshSeconds : hasSettings ? payload.settings.refreshSeconds : fallback;
  if (explicit && (raw === null || raw === undefined || raw === "")) return 0;
  const value = Number(raw);
  if (explicit && value === 0) return 0;
  if (!Number.isFinite(value) || value < 1 || value > 86400) return 0;
  return Math.floor(value);
}
