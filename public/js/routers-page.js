import { loadResource, refreshSeconds, renderSourceBanner } from "./data/multi-provider-client.js";
import { providerIdentity } from "./data/provider-adapters.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let routerRecords = [];
let refreshTimer = 0;

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number) : "";
}

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

function renderRouter(record) {
  const card = make("article", "catalog-card");
  const top = make("div", "catalog-card-top");
  top.append(make("h3", "", record.name || ""));
  top.append(make("span", `router-provider provider-${Number(record.providerId)}`, record.providerName || providerIdentity(record.providerId).nameAr));
  card.append(top);
  const facts = make("div", "catalog-facts");
  const price = money(record.price);
  const increase = money(record.increase);
  const finalPrice = money(record.finalPrice);
  if (price) facts.append(make("span", "catalog-fact", `السعر الأساسي: ${price} ج`));
  if (increase) facts.append(make("span", "catalog-fact", `الزيادة: ${increase} ج`));
  if (facts.childElementCount) card.append(facts);
  const row = make("div", "price-row");
  const discount = record.showOffer ? money(record.discountPrice) : "";
  if (discount && finalPrice && Number(record.discountPrice) < Number(record.finalPrice)) {
    row.append(make("span", "price-old", `${finalPrice} ج`), make("strong", "price-current", `${discount} ج`), make("span", "offer-chip", "عرض"));
  } else if (finalPrice) row.append(make("strong", "price-current", `${finalPrice} ج`));
  else row.append(make("span", "price-unit", "السعر النهائي غير متاح"));
  card.append(row);
  if (Array.isArray(record.details) && record.details.length) {
    const details = make("div", "router-details");
    for (const detail of record.details) {
      const block = make("div", "router-detail");
      const heading = [detail.section, detail.title].filter(Boolean).join(" — ");
      if (heading) block.append(make("strong", "", heading));
      if (detail.content) block.append(make("p", "", detail.content));
      details.append(block);
    }
    card.append(details);
  }
  return card;
}

function renderList() {
  const chosen = $("provider-filter").value;
  const filtered = routerRecords.filter((router) => chosen === "all" || String(router.providerId) === chosen);
  const list = $("router-list");
  list.replaceChildren(...filtered.map(renderRouter));
  list.setAttribute("aria-busy", "false");
  const empty = $("router-empty");
  empty.hidden = filtered.length > 0;
  if (filtered.length) empty.textContent = "";
  else if (routerRecords.length && chosen !== "all") empty.textContent = "لا توجد راوترات صالحة لهذا المزود حاليًا.";
  else empty.textContent = "لا توجد راوترات مكتملة ومفعّلة حاليًا. ستظهر الأجهزة تلقائيًا بعد إضافة سجلات صحيحة وتفعيلها في مصدرها.";
}

async function start() {
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
    const seconds = refreshSeconds(payload, 15);
    if (result.sourceMode === "live" && seconds > 0) refreshTimer = window.setTimeout(() => start().catch(showFailure), seconds * 1000);
    window.addEventListener("online", () => start().catch(showFailure), { once: true });
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
