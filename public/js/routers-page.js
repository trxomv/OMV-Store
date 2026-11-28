import { loadResource, refreshSeconds, renderSourceBanner } from "./data/multi-provider-client.js";
import { legacyProviderId, providerIdentity } from "./data/provider-adapters.js";
import { createRouterCard, createRouterSourceTableLoader, enrichRouterRows, routerBelongsToProvider } from "./components/router-card.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let routerRecords = [];
let refreshTimer = 0;
let renderVersion = 0;
const routerSourceTables = createRouterSourceTableLoader((providerId) => loadResource("provider", providerId));

function renderFilters(providers) {
  const select = $("provider-filter");
  const current = select.value || "all";
  const normalized = new Map((providers || []).map((provider) => [Number(provider.providerId ?? provider.id), provider]));
  const options = [{ id: "all", label: "كل الشبكات" }];
  for (let id = 1; id <= 4; id += 1) {
    const provider = normalized.get(id);
    const identity = providerIdentity(id, provider?.name);
    options.push({ id: String(id), label: identity.nameAr });
  }
  select.replaceChildren(...options.map((option) => {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = option.label;
    return item;
  }));
  if (options.some((option) => option.id === current)) select.value = current;
}

function renderList() {
  const chosen = $("provider-filter").value;
  const filtered = routerRecords.filter((router) => routerBelongsToProvider(router, chosen));
  const list = $("router-list");
  list.replaceChildren(...filtered.map(createRouterCard));
  list.setAttribute("aria-busy", "false");
  const empty = $("router-empty");
  empty.hidden = filtered.length > 0;
  if (filtered.length) empty.textContent = "";
  else if (routerRecords.length && chosen !== "all") empty.textContent = "لا توجد راوترات صالحة لهذا المزود حاليًا.";
  else empty.textContent = "لا توجد راوترات مكتملة ومفعّلة حاليًا. ستظهر الأجهزة تلقائيًا بعد إضافة سجلات صحيحة وتفعيلها في مصدرها.";
}

async function enrichVisibleRouterBadges(records, version) {
  const providers = new Map();
  for (const record of records) {
    const canonicalId = providerIdentity(record.providerId ?? record.canonicalProviderId, record.providerName).canonicalId;
    const providerId = Number(record.providerLegacyId) || legacyProviderId(canonicalId);
    if (canonicalId && providerId) providers.set(canonicalId, providerId);
  }
  if (!providers.size) return;
  const tables = new Map();
  await Promise.all([...providers].map(async ([canonicalId, providerId]) => {
    tables.set(canonicalId, await routerSourceTables.load(providerId));
  }));
  if (version !== renderVersion) return;
  routerRecords = records.map((record) => {
    const canonicalId = providerIdentity(record.providerId ?? record.canonicalProviderId, record.providerName).canonicalId;
    return enrichRouterRows([record], tables.get(canonicalId))[0];
  });
  renderList();
}

async function start() {
  const version = ++renderVersion;
  routerSourceTables.clear();
  $("copyright-year").textContent = String(new Date().getFullYear());
  try {
    const result = await loadResource("routers");
    renderSourceBanner($("data-mode-banner"), result);
    const payload = result.payload;
    renderFilters(payload.providers || []);
    routerRecords = Array.isArray(payload.routers) ? payload.routers : [];
    $("routers-status").textContent = payload.sectionEnabled === false
      ? "قسم All Routers غير مفعّل في Main Categories."
      : routerRecords.length ? `عدد الراوترات الصالحة: ${routerRecords.length}` : "لا توجد راوترات مفعّلة حاليًا.";
    $("router-footnote").textContent = payload.sectionEnabled === false
      ? "تتبع حالة القسم إعداد Main Categories؛ لم تُعرض أي سجلات لأن القسم معطّل."
      : "تستخدم هذه الصفحة نفس سجل الراوتر الموحّد الذي تستخدمه أقسام الراوتر داخل صفحات المزودين.";
    renderList();
    if (routerRecords.length) void enrichVisibleRouterBadges(routerRecords, version);
    const seconds = refreshSeconds(payload, 15);
    if (result.sourceMode === "live" && seconds > 0) refreshTimer = window.setTimeout(() => start().catch(showFailure), seconds * 1000);
    window.addEventListener("online", () => {
      routerSourceTables.clear();
      start().catch(showFailure);
    }, { once: true });
  } catch (error) {
    console.error("Router catalog data could not be loaded", error);
    showFailure();
  }
}

function showFailure() {
  window.clearTimeout(refreshTimer);
  $("routers-status").textContent = "تعذر تحميل بيانات الراوترات";
  routerRecords = [];
  renderList();
}

$("provider-filter").addEventListener("change", renderList);
start();
