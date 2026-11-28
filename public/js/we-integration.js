import { loadResource, refreshSeconds } from "./data/multi-provider-client.js";
import { normalizeTerms } from "./data/provider-adapters.js";
import { createRouterCard, enrichRouterRows, routerSectionEnabled } from "./components/router-card.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let timer = 0;

function renderRouters(payload) {
  const section = $("we-router-section");
  const data = payload.sections?.routers;
  section.hidden = !routerSectionEnabled(data);
  if (section.hidden) return;
  const records = enrichRouterRows(data.rows, payload.tables?.routers);
  $("we-router-list").replaceChildren(...records.map(createRouterCard));
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
