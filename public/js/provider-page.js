import { loadResource, refreshSeconds, renderSourceBanner } from "./data/multi-provider-client.js";
import {
  finiteNumber,
  normalizeContact,
  normalizePayment,
  normalizeTerms,
  offerForPlan,
  providerIdentity,
  providerRoute,
  legacyProviderId,
  providerState,
  providerStateLabel,
  providerAnnouncements,
  rowValue,
} from "./data/provider-adapters.js";
import { hasCompletePlanFacts, planAvailability, providerPlanRows, providerVisual, whatsappPhone, whatsappPlanHref } from "./provider-page-ui.js";

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const routeInput = new URLSearchParams(window.location.search).get("id") || document.body.dataset.providerId || "";
const queryId = legacyProviderId(routeInput);
const canonicalRoute = providerRoute(routeInput);
let activeProvider = null;
let refreshTimer = 0;

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value) {
  const amount = finiteNumber(value);
  return amount !== null && amount > 0 ? formatNumber(amount) : "";
}

function setProviderHeader(provider) {
  const identity = providerIdentity(provider.id, provider.name);
  const visual = providerVisual(identity);
  document.title = `${identity.nameAr} — OMV Store`;
  $("breadcrumb-provider").textContent = identity.nameAr;
  $("provider-eyebrow").textContent = `شبكة ${identity.nameAr}`;
  $("provider-title").textContent = identity.nameAr;
  $("provider-subtitle").textContent = "استكشف الخدمات المتاحة من مصدر الشبكة المعتمد.";
  $("provider-brand-name").textContent = identity.nameAr;
  $("provider-mark").textContent = identity.name === "WE" ? "WE" : identity.name;
  if (visual) {
    const headerImage = $("provider-header-image");
    const logo = $("provider-logo");
    headerImage.src = visual.header;
    headerImage.alt = `${identity.nameAr} — هوية الشبكة`;
    logo.src = visual.logo;
    logo.alt = `شعار ${identity.nameAr}`;
    $("provider-hero").style.setProperty("--provider-color", visual.color);
  }
  $("provider-hero").classList.add(`provider-${identity.id}`);
  activeProvider = { ...identity, ...provider };
}

function stateMessage(payload, state) {
  if (state === "disabled") return "هذا المزود معطّل في سجل Telecom Providers؛ لا تُعرض عروض أو منتجات له حاليًا.";
  if (state === "page_disabled") return "صفحة هذا المزود غير مفعّلة في Website Settings.";
  if (state === "offers_disabled") return "قسم عروض هذا المزود غير مفعّل في Page Settings. ستظهر فقط الأقسام الأخرى المفعّلة.";
  if (state === "empty") return "لا توجد باقات مكتملة ومفعّلة للعرض حاليًا.";
  if (["unavailable", "inaccessible", "unsupported_schema"].includes(state)) return payload.message || "تعذر الوصول إلى مخطط بيانات المزود أو قراءته حاليًا.";
  if (state === "available") return "تُعرض الأقسام المفعّلة فقط، وتُقرأ الباقات من المصدر دون إعادة احتساب الأسعار.";
  return "بيانات هذه الشبكة قيد التجهيز.";
}

function renderStatus(payload) {
  const state = providerState({
    ...payload.provider,
    pageEnabled: payload.pageEnabled,
    offersEnabled: payload.pageSettings?.offersEnabled,
    sourceStatus: payload.sourceStatus,
    status: payload.pageState,
  });
  $("provider-status").textContent = providerStateLabel(state);
  $("provider-header-status").textContent = providerStateLabel(state);
  $("page-state").textContent = stateMessage(payload, state);
  $("provider-state-fact").textContent = stateMessage(payload, state);
  return state;
}

function displayQuota(row) {
  const gb = finiteNumber(rowValue(row, ["GBs", "GB", "Gigabytes"]));
  if (gb !== null && gb > 0) return `${formatNumber(gb)} جيجا`;
  const mb = finiteNumber(rowValue(row, ["MBs", "MB", "Megabytes"]));
  return mb !== null && mb > 0 ? `${formatNumber(mb)} ميجا` : "";
}

function planMessage(row, title, price) {
  const facts = [title, displayQuota(row)];
  const minutes = finiteNumber(rowValue(row, ["Minutes", "Minute"]));
  if (minutes !== null && minutes >= 0) facts.push(`${formatNumber(minutes)} دقيقة`);
  if (price) facts.push(`السعر ${price} ج`);
  return `السلام عليكم، أريد الاشتراك في ${facts.filter(Boolean).join(" — ")}`;
}

function renderPlanAction(label, href) {
  if (!href) {
    const button = make("button", "provider-action-button is-disabled", `${label} — غير متاح`);
    button.type = "button";
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    return button;
  }
  const link = make("a", "provider-action-button", label);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderOfferCard(row, index, contacts) {
  const planId = rowValue(row, ["No. of Plan", "No of Plan", "Plan ID"]);
  const sourceName = rowValue(row, ["Plan Name", "Package Name", "Name"]);
  const title = sourceName ? String(sourceName) : planId !== undefined ? `باقة رقم ${planId}` : `باقة ${index + 1}`;
  const card = make("article", "offer-card provider-offer-card");
  card.style.setProperty("--accent", providerVisual(providerIdentity(activeProvider.id))?.color || "#a554ff");
  const availability = planAvailability(row);
  if (!availability.available) card.classList.add("is-unavailable");
  const top = make("div", "catalog-card-top");
  top.className = "card-top";
  top.append(make("span", "card-number", String(index + 1).padStart(2, "0")));
  const badge = String(rowValue(row, ["Badge", "Badges", "Badge Text"]) || "").trim();
  if (badge) top.append(make("span", "plan-badge badge-default", badge));
  card.append(top);

  const quota = displayQuota(row);
  const minutes = finiteNumber(rowValue(row, ["Minutes", "Minute"]));
  const duration = String(rowValue(row, ["Duration", "Validity", "Days Left"]) || "").trim();
  const facts = make("div", "provider-card-facts");
  if (quota) facts.append(make("span", "provider-card-fact provider-card-data", quota));
  if (minutes !== null && minutes >= 0) facts.append(make("span", "provider-card-fact provider-card-minutes", `${formatNumber(minutes)} دقيقة`));
  if (duration) facts.append(make("span", "provider-card-fact provider-card-duration", duration));
  if (facts.childElementCount) card.append(facts);

  const finalPrice = finiteNumber(rowValue(row, ["Final Price", "FInal Price", "Final Price (EGP)"]));
  const offer = offerForPlan(row, true);
  const offerPrice = offer?.offerPrice !== null && offer?.offerPrice !== undefined && offer.offerPrice > 0 && finalPrice !== null && offer.offerPrice < finalPrice ? offer.offerPrice : null;
  const price = make("div", "price-band");
  const valueStack = make("div", "price-value-stack");
  if (offerPrice !== null) {
    valueStack.append(make("del", "original-price", `${formatMoney(finalPrice)} ج`), make("span", "current-price", `${formatMoney(offerPrice)} ج`));
  } else if (finalPrice !== null && finalPrice > 0) {
    valueStack.append(make("span", "current-price", `${formatMoney(finalPrice)} ج`));
  } else {
    valueStack.append(make("span", "price-unit", "السعر غير متاح في المصدر"));
  }
  price.append(valueStack, make("b", "currency", "جنيه"));
  if (price.childElementCount) card.append(price);
  const discount = offerPrice !== null && finalPrice ? Math.round((1 - offerPrice / finalPrice) * 100) : offer?.discountPercent;
  if (discount !== null && discount !== undefined && discount > 0) card.append(make("small", "discount-badge", `خصم ${formatNumber(discount)}%`));
  const status = make("p", `provider-plan-status ${availability.available ? "is-available" : "is-unavailable"}`, availability.label);
  status.setAttribute("role", "status");
  card.append(status);
  const actions = make("div", "card-actions provider-card-actions");
  const phone = whatsappPhone(contacts, activeProvider);
  const priceValue = offerPrice ?? finalPrice;
  const message = planMessage(row, title, formatMoney(priceValue));
  const baseHref = whatsappPlanHref(phone);
  const subscribeHref = availability.available && hasCompletePlanFacts(row) ? whatsappPlanHref(phone, message) : "";
  actions.append(renderPlanAction("اشترك الآن ↗", subscribeHref), renderPlanAction("واتساب", availability.available ? baseHref : ""));
  card.append(actions);
  return card;
}

function renderOffers(payload) {
  const section = $("provider-offers");
  const enabled = payload.sections?.offers?.enabled === true;
  section.hidden = !enabled;
  if (!enabled) return;
  const table = payload.tables?.standard;
  const rows = providerPlanRows(table);
  $("provider-offer-fact").textContent = rows.length ? `${formatNumber(rows.length)} باقات متاحة` : "لا توجد باقات متاحة";
  const list = $("provider-offer-list");
  list.replaceChildren(...rows.map((row, index) => renderOfferCard(row, index, payload.site?.contacts || [])));
  const empty = $("provider-offers-empty");
  empty.hidden = rows.length > 0;
  if (!rows.length) empty.textContent = table?.status === "available" || table?.status === "empty"
    ? "لا توجد باقات مكتملة ومفعّلة للعرض في هذا المصدر حاليًا."
    : `تعذر عرض الباقات: حالة الورقة ${table?.status || "غير معروفة"}.`;
}

function renderRouterCard(router) {
  const card = make("article", "catalog-card");
  const top = make("div", "catalog-card-top");
  top.append(make("h3", "", String(router.name || "")));
  top.append(make("span", "router-provider", String(router.providerName || "")));
  card.append(top);
  const facts = make("div", "catalog-facts");
  const basePrice = formatMoney(router.price);
  const increase = formatMoney(router.increase);
  if (basePrice) facts.append(make("span", "catalog-fact", `السعر الأساسي: ${basePrice} ج`));
  if (increase) facts.append(make("span", "catalog-fact", `الزيادة: ${increase} ج`));
  if (facts.childElementCount) card.append(facts);
  const price = make("div", "price-row");
  const finalPrice = formatMoney(router.finalPrice);
  const discountPrice = router.showOffer ? formatMoney(router.discountPrice) : "";
  if (discountPrice && finalPrice && Number(router.discountPrice) < Number(router.finalPrice)) {
    price.append(make("span", "price-old", `${finalPrice} ج`), make("strong", "price-current", `${discountPrice} ج`), make("span", "offer-chip", "عرض"));
  } else if (finalPrice) price.append(make("strong", "price-current", `${finalPrice} ج`));
  else price.append(make("span", "price-unit", "السعر غير مكتمل في المصدر"));
  card.append(price);
  const details = Array.isArray(router.details) ? router.details : [];
  if (details.length) {
    const list = make("div", "router-details");
    for (const detail of details) {
      const item = make("div", "router-detail");
      const title = [detail.section, detail.title].filter(Boolean).join(" — ");
      if (title) item.append(make("strong", "", title));
      if (detail.content) item.append(make("p", "", detail.content));
      list.append(item);
    }
    card.append(list);
  }
  return card;
}

function renderRouters(payload) {
  const section = $("provider-routers");
  const routerData = payload.sections?.routers;
  const enabled = routerData?.enabled === true;
  section.hidden = !enabled;
  if (!enabled) return;
  const rows = Array.isArray(routerData.rows) ? routerData.rows : [];
  $("provider-router-list").replaceChildren(...rows.map(renderRouterCard));
  const empty = $("provider-routers-empty");
  empty.hidden = rows.length > 0;
  empty.textContent = rows.length ? "" : routerData.status === "empty"
    ? "لا توجد راوترات مكتملة ومفعّلة لهذا المزود حاليًا."
    : `تعذر قراءة سجل الراوترات: ${routerData.status || "حالة غير معروفة"}.`;
}

function renderTerms(payload) {
  const section = $("provider-terms");
  const enabled = payload.sections?.terms?.enabled === true;
  section.hidden = !enabled;
  if (!enabled) return;
  const terms = normalizeTerms(payload.terms || payload.tables?.terms || { status: "not_inspected", rows: [] });
  const list = $("provider-terms-list");
  list.replaceChildren();
  const empty = $("provider-terms-empty");
  if (!terms.rows.length) {
    empty.hidden = false;
    empty.textContent = terms.status === "empty" ? "لا توجد شروط مفعّلة ومدخلة لهذا المزود حاليًا." : `تعذر قراءة الشروط: ${terms.status}.`;
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

function safeExternalContact(contact) {
  const link = make("a", "catalog-contact-link", contact.label);
  link.href = contact.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderShared(site) {
  const contacts = (site?.contacts || []).map((item) => normalizeContact(item, activeProvider)).filter(Boolean).sort((a, b) => a.order - b.order);
  const contactList = $("provider-contact-list");
  contactList.replaceChildren(...contacts.map(safeExternalContact));
  if (!contacts.length) contactList.append(make("span", "empty-note", "لا توجد روابط تواصل مفعّلة لهذا المزود."));
  const payments = (site?.paymentMethods || []).map(normalizePayment).filter(Boolean);
  const paymentList = $("provider-payment-list");
  paymentList.replaceChildren();
  if (!payments.length) paymentList.append(make("span", "empty-note", "لا توجد وسائل دفع مفعّلة حاليًا."));
  for (const payment of payments) {
    const item = make("span", "catalog-payment");
    if (payment.asset) {
      const image = document.createElement("img");
      image.src = payment.asset;
      image.alt = "";
      image.loading = "lazy";
      item.append(image);
    }
    item.append(make("span", "", payment.label));
    paymentList.append(item);
  }
  const announcements = providerAnnouncements(site?.announcements || [], activeProvider);
  const announcementBar = $("announcement-bar");
  const announcementText = $("announcement-text");
  const announcementDots = $("announcement-dots");
  if (announcementBar && announcementText) {
    announcementBar.hidden = announcements.length === 0;
    if (announcements.length) {
      const values = announcements.slice(0, 3).map((item) => String(rowValue(item, ["Value", "text"]) || "").trim()).filter(Boolean);
      announcementText.textContent = values[0] || "";
      announcementDots.textContent = values.length > 1 ? `1 / ${values.length}` : "";
    }
  }
}

async function start() {
  $("copyright-year").textContent = String(new Date().getFullYear());
  if (!queryId || !canonicalRoute) {
    $("provider-title").textContent = "الشبكة غير محددة";
    $("provider-status").textContent = "رابط غير مكتمل";
    $("page-state").textContent = "اختر مزودًا من الصفحة الرئيسية لعرض بياناته.";
    return;
  }
  if (!document.body.dataset.providerId && canonicalRoute && window.location.pathname !== canonicalRoute) {
    window.location.replace(canonicalRoute);
    return;
  }
  try {
    const result = await loadResource("provider", queryId);
    renderSourceBanner($("data-mode-banner"), result);
    const payload = result.payload;
    if (!payload.provider) throw new Error("provider-not-found");
    setProviderHeader(payload.provider);
    const state = renderStatus(payload);
    renderOffers(payload);
    renderRouters(payload);
    renderTerms(payload);
    renderShared(payload.site);
    const seconds = refreshSeconds(payload, 15);
    if (result.sourceMode === "live" && seconds > 0) {
      refreshTimer = window.setTimeout(() => start().catch(showFailure), seconds * 1000);
    }
    window.addEventListener("online", () => start().catch(showFailure), { once: true });
    if (state === "disabled" || state === "page_disabled") {
      $("provider-subtitle").textContent = "الحالة الظاهرة مطابقة لإعدادات المصدر ولا تغيّر بياناته.";
    }
  } catch (error) {
    console.error("Provider page data could not be loaded", error);
    showFailure();
  }
}

function showFailure() {
  window.clearTimeout(refreshTimer);
  $("provider-status").textContent = "تعذر تحميل بيانات الشبكة";
  $("page-state").textContent = "تعذر قراءة بيانات هذا المزود حاليًا. أعد المحاولة لاحقًا؛ لم تُعرض بيانات افتراضية.";
}

start();
