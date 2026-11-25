import { loadResource, refreshSeconds, renderSourceBanner } from "./data/multi-provider-client.js";
import { legacyProviderId, providerIdentity, providerRoute } from "./data/provider-adapters.js";
import { competitionPageState, publicCompetitionRows, supportedCompetitionProvider } from "./data/provider-page-rules.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const requestedProvider = supportedCompetitionProvider(new URLSearchParams(window.location.search).get("provider"));
let refreshTimer = 0;

function setProviderIdentity(providerId) {
  const identity = providerIdentity(providerId);
  document.title = `مسابقات ${identity.nameAr} — OMV Store`;
  $("competition-provider-name").textContent = identity.nameAr;
  $("competition-breadcrumb").textContent = `مسابقات ${identity.nameAr}`;
  $("competition-intro").textContent = `المعلومات العامة للمسابقات المفعّلة لدى ${identity.nameAr}، كما وردت من مصدر الشبكة.`;
  $("competition-return").href = providerRoute(providerId);
  $("competition-return").textContent = `العودة إلى ${identity.nameAr}`;
}

function competitionCard(row) {
  const card = make("article", "catalog-card competition-card");
  card.append(make("h3", "competition-title", row.title));
  if (row.competitionId) card.append(make("p", "competition-id", `رقم المسابقة: ${row.competitionId}`));

  const facts = make("div", "catalog-facts competition-facts");
  if (row.benefitType) facts.append(make("span", "catalog-fact", row.benefitType));
  if (row.giftDataGb) facts.append(make("span", "catalog-fact", `${row.giftDataGb} جيجا`));
  const duration = [row.giftDuration, row.durationUnit].filter(Boolean).join(" ");
  if (duration) facts.append(make("span", "catalog-fact", duration));
  if (row.startDate) facts.append(make("span", "catalog-fact", `تبدأ: ${row.startDate}`));
  if (row.endDate) facts.append(make("span", "catalog-fact", `تنتهي: ${row.endDate}`));
  if (facts.childElementCount) card.append(facts);
  if (row.terms) card.append(make("p", "competition-terms", row.terms));
  return card;
}

function renderPayload(payload) {
  const rows = publicCompetitionRows(payload);
  const state = competitionPageState(payload);
  const list = $("competition-list");
  const empty = $("competition-state");
  list.replaceChildren(...rows.map(competitionCard));
  list.setAttribute("aria-busy", "false");
  empty.hidden = rows.length > 0;

  if (state === "disabled") {
    $("competitions-status").textContent = "المسابقات غير مفعّلة لهذا المزود حاليًا.";
    empty.textContent = "لا يمكن عرض المسابقات لأن إعداد الصفحة أو المسابقات غير مفعّل في المصدر.";
  } else if (state === "empty") {
    $("competitions-status").textContent = "لا توجد مسابقات عامة مفعّلة حاليًا.";
    empty.textContent = "ستظهر هنا المسابقات التي تم تفعيلها وإكمال عنوانها ومعرّفها في المصدر.";
  } else if (state === "error") {
    $("competitions-status").textContent = "تعذر قراءة المسابقات";
    empty.textContent = "تعذر قراءة قائمة المسابقات من مصدر الشبكة. حاول مرة أخرى لاحقًا.";
  } else {
    $("competitions-status").textContent = `عدد المسابقات العامة: ${new Intl.NumberFormat("en-US").format(rows.length)}`;
    empty.textContent = "";
  }
}

function showFailure() {
  window.clearTimeout(refreshTimer);
  $("competitions-status").textContent = "تعذر تحميل بيانات المسابقات";
  const list = $("competition-list");
  list.replaceChildren();
  list.setAttribute("aria-busy", "false");
  const empty = $("competition-state");
  empty.hidden = false;
  empty.textContent = "تعذر الاتصال بمصدر المسابقات حاليًا. لم تُعرض بيانات بديلة أو تجريبية.";
}

async function start() {
  $("copyright-year").textContent = String(new Date().getFullYear());
  if (!requestedProvider) {
    document.title = "مسابقات الشبكة — OMV Store";
    $("competitions-status").textContent = "رابط مزود غير صالح";
    $("competition-provider-name").textContent = "غير محدد";
    $("competition-breadcrumb").textContent = "مسابقات الشبكة";
    $("competition-return").href = "/";
    $("competition-return").textContent = "العودة إلى الرئيسية";
    const empty = $("competition-state");
    empty.hidden = false;
    empty.textContent = "اختر مسابقة من صفحة Vodafone أو Orange أو Etisalat. قيمة المزود في الرابط غير صالحة.";
    $("competition-list").setAttribute("aria-busy", "false");
    return;
  }

  setProviderIdentity(requestedProvider);
  try {
    const result = await loadResource("provider", legacyProviderId(requestedProvider));
    renderSourceBanner($("data-mode-banner"), result);
    const payload = result.payload;
    const responseProvider = supportedCompetitionProvider(payload.provider?.providerId ?? payload.provider?.id);
    if (!payload.provider || responseProvider !== requestedProvider) throw new Error("provider-response-mismatch");
    renderPayload(payload);
    const seconds = refreshSeconds(payload, 15);
    if (result.sourceMode === "live" && seconds > 0) {
      refreshTimer = window.setTimeout(() => start().catch(showFailure), seconds * 1000);
    }
  } catch (error) {
    console.error("Competition page data could not be loaded", error);
    showFailure();
  }
}

start();
window.addEventListener("online", () => start().catch(showFailure));
