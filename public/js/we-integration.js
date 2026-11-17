import { loadResource, refreshSeconds } from "./data/multi-provider-client.js";
import { normalizeTerms } from "./data/provider-adapters.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let timer = 0;

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number) : "";
}

function routerCard(router) {
  const card = make("article", "catalog-card");
  const top = make("div", "catalog-card-top");
  top.append(make("h3", "", String(router.name || "")));
  top.append(make("span", "router-provider", "WE"));
  card.append(top);
  const facts = make("div", "catalog-facts");
  const base = money(router.price);
  const increase = money(router.increase);
  if (base) facts.append(make("span", "catalog-fact", `السعر الأساسي: ${base} ج`));
  if (increase) facts.append(make("span", "catalog-fact", `الزيادة: ${increase} ج`));
  if (facts.childElementCount) card.append(facts);
  const price = make("div", "price-row");
  const finalPrice = money(router.finalPrice);
  const discounted = router.showOffer ? money(router.discountPrice) : "";
  if (discounted && finalPrice && Number(router.discountPrice) < Number(router.finalPrice)) {
    price.append(make("span", "price-old", `${finalPrice} ج`), make("strong", "price-current", `${discounted} ج`), make("span", "offer-chip", "عرض"));
  } else if (finalPrice) price.append(make("strong", "price-current", `${finalPrice} ج`));
  else price.append(make("span", "price-unit", "السعر النهائي غير متاح"));
  card.append(price);
  if (Array.isArray(router.details) && router.details.length) {
    const details = make("div", "router-details");
    for (const detail of router.details) {
      const row = make("div", "router-detail");
      const heading = [detail.section, detail.title].filter(Boolean).join(" — ");
      if (heading) row.append(make("strong", "", heading));
      if (detail.content) row.append(make("p", "", detail.content));
      details.append(row);
    }
    card.append(details);
  }
  return card;
}

function renderRouters(payload) {
  const section = $("we-router-section");
  const data = payload.sections?.routers;
  section.hidden = data?.enabled !== true;
  if (section.hidden) return;
  const records = Array.isArray(data.rows) ? data.rows : [];
  $("we-router-list").replaceChildren(...records.map(routerCard));
  const empty = $("we-router-empty");
  empty.hidden = records.length > 0;
  empty.textContent = records.length ? "" : data.status === "empty"
    ? "لا توجد أجهزة راوتر مفعّلة لهذا القسم حاليًا."
    : `تعذر قراءة راوترات WE: ${data.status || "حالة غير معروفة"}.`;
}

function renderTerms(payload) {
  const section = $("we-terms-section");
  const enabled = payload.sections?.terms?.enabled === true;
  section.hidden = !enabled;
  if (!enabled) return;
  const terms = normalizeTerms(payload.terms || { status: "not_inspected", rows: [] });
  const list = $("we-terms-list");
  list.replaceChildren();
  const empty = $("we-terms-empty");
  if (!terms.rows.length) {
    empty.hidden = false;
    empty.textContent = terms.status === "empty" ? "لا توجد شروط مفعّلة ومدخلة حاليًا." : `تعذر قراءة شروط WE: ${terms.status}.`;
    return;
  }
  empty.hidden = true;
  const labels = { General: "عام", Important: "مهم", Renewal: "التجديد" };
  for (const term of terms.rows) {
    const type = ["General", "Important", "Renewal"].includes(term.type) ? term.type : "General";
    const item = make("article", `term-item term-${type.toLowerCase()}`);
    item.append(make("span", "term-type", labels[type]));
    item.append(make("p", "", term.text));
    list.append(item);
  }
}

async function refresh() {
  try {
    const result = await loadResource("provider", 2);
    renderRouters(result.payload);
    renderTerms(result.payload);
    window.clearTimeout(timer);
    if (result.sourceMode === "live") timer = window.setTimeout(refresh, refreshSeconds(result.payload, 15) * 1000);
  } catch (error) {
    console.error("WE router/terms data could not be loaded", error);
  }
}

refresh();
window.addEventListener("online", refresh);
