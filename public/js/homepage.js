import "../site-config.js";
import { loadResource, refreshSeconds, renderSourceBanner } from "./data/multi-provider-client.js";
import {
  normalizeContact,
  normalizePayment,
  normalizeTerms,
  providerAnnouncements,
  providerIdentity,
  providerState,
  providerStateLabel,
  routerAnnouncements,
  rowValue,
  visibleAnnouncements,
} from "./data/provider-adapters.js";

const CONFIG_URL = "data/homepage-config.json";
const FALLBACK_PROVIDERS = [1, 2, 3, 4].map((id) => ({ id, ...providerIdentity(id) }));
const byId = (id) => document.getElementById(id);
let refreshTimer = 0;

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function safeContactHref(value) {
  try {
    const url = new URL(value);
    const allowed = new Set(["wa.me", "t.me", "chat.whatsapp.com"]);
    return url.protocol === "https:" && allowed.has(url.hostname.toLowerCase()) ? url.href : null;
  } catch {
    return null;
  }
}

function createExternalLink(label, href, className = "") {
  const safeHref = safeContactHref(href);
  if (!safeHref) return null;
  const link = make("a", className, label);
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function localizeProvider(provider) {
  const identity = providerIdentity(provider.id, provider.name);
  return { ...identity, ...provider, name: provider.name || identity.name, nameAr: identity.nameAr };
}

function providerHref(provider) {
  return Number(provider.id) === 2 ? "we.html" : `provider.html?id=${encodeURIComponent(provider.id)}`;
}

function providerDescription(state, provider) {
  if (state === "available") return Number(provider.id) === 2 ? "الباقات والخدمات المتاحة" : "الخدمات المتاحة من هذه الشبكة";
  if (state === "offers_disabled") return "قسم العروض غير مفعّل حاليًا حسب إعداد الشبكة";
  if (state === "unavailable") return "بيانات الشبكة غير متاحة حاليًا";
  return "الخدمات قيد التجهيز — ترقّبوا توفرها";
}

function renderProviders(site, uiConfig) {
  const grid = byId("provider-grid");
  const liveProviders = new Map((site.providers || []).map((provider) => [Number(provider.id), provider]));
  const configuredFallbacks = Array.isArray(uiConfig.providerFallbacks) ? uiConfig.providerFallbacks : FALLBACK_PROVIDERS;
  const cards = [1, 2, 3, 4].map((id) => {
    const fallback = configuredFallbacks.find((provider) => Number(provider.id) === id) || FALLBACK_PROVIDERS[id - 1];
    return { ...fallback, ...(liveProviders.get(id) || {}), id };
  });

  grid.replaceChildren();
  for (const rawProvider of cards) {
    const provider = localizeProvider(rawProvider);
    const state = providerState(provider);
    const isReady = state === "available";
    const link = make("a", `provider-card provider-${Number(provider.id)} ${isReady ? "is-ready" : "is-coming"}`);
    link.href = providerHref(provider);
    link.setAttribute("aria-label", `${provider.nameAr} — ${providerStateLabel(state)}`);

    const top = make("div", "provider-card-top");
    const markText = Number(provider.id) === 2 ? "WE" : provider.name;
    const mark = make("span", `provider-wordmark wordmark-${Number(provider.id)}`, markText);
    mark.setAttribute("aria-hidden", "true");
    const stateBadge = make("span", `provider-state ${isReady ? "state-ready" : "state-soon"}`, providerStateLabel(state));
    top.append(mark, stateBadge);

    const body = make("div", "provider-card-body");
    const title = make("h3", "", provider.nameAr);
    const english = make("span", "provider-english", provider.name);
    const description = make("p", "provider-description", providerDescription(state, provider));
    const action = make("span", "provider-action", Number(provider.id) === 2 ? "استكشف باقات WE" : "عرض حالة الشبكة");
    action.append(make("span", "", "←"));
    body.append(title, english, description);
    const notices = providerAnnouncements(site.announcements || [], provider).slice(0, 1);
    if (notices.length) body.append(make("p", "provider-announcement", String(rowValue(notices[0], ["Value", "text"]) || "")));
    body.append(action);
    link.append(top, body);
    grid.append(link);
  }
  grid.setAttribute("aria-busy", "false");
}

function parseEnabled(value) {
  if (value === true || String(value ?? "").trim().toLowerCase() === "true" || String(value ?? "").trim() === "1") return true;
  return false;
}

function renderRouterSection(site, routersData) {
  const section = byId("routers");
  const category = (site.categories || []).find((item) => {
    const id = String(rowValue(item, ["Category ID"]) || "").trim().toLowerCase();
    const name = String(rowValue(item, ["Category Name"]) || "").trim().toLowerCase();
    return ["routers", "all routers"].includes(id) || ["routers", "all routers"].includes(name);
  });
  if (category && !parseEnabled(rowValue(category, ["Enable"]))) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const sectionEnabled = routersData?.sectionEnabled === true;
  const records = Array.isArray(routersData?.routers) ? routersData.routers : [];
  const available = sectionEnabled && records.length > 0;
  byId("router-status").textContent = routersData?.sectionEnabled === false
    ? "قسم الراوترات غير مفعّل حاليًا حسب الإعدادات"
    : available ? `عدد الأجهزة المتاحة: ${records.length}` : "لا توجد راوترات مفعّلة حاليًا";
  byId("router-description").textContent = available
    ? "تصفح الأجهزة المتاحة من مختلف الشبكات في كتالوج موحّد."
    : "القسم جاهز لعرض أجهزة الشبكات عند إضافة سجلات مكتملة وتفعيلها من مصدرها.";
  const cta = byId("router-catalog-link");
  if (cta) cta.hidden = routersData?.sectionEnabled === false;
  const notices = routerAnnouncements(site.announcements || []);
  const noticeList = byId("router-announcements");
  noticeList.replaceChildren(...notices.slice(0, 2).map((item) => make("p", "router-announcement", String(rowValue(item, ["Value", "text"]) || ""))));
}

function renderAnnouncements(site) {
  const list = byId("announcement-list");
  list.replaceChildren();
  const announcements = visibleAnnouncements(site.announcements || [], "All");
  if (!announcements.length) list.append(make("p", "empty-note", "لا توجد إعلانات عامة منشورة حاليًا."));
  for (const [index, item] of announcements.slice(0, 4).entries()) {
    const card = make("article", "announcement-card");
    card.append(make("span", "announcement-number", String(index + 1).padStart(2, "0")), make("p", "", String(rowValue(item, ["Value", "text"]) || "")));
    list.append(card);
  }
  list.setAttribute("aria-busy", "false");
}

function renderContacts(site) {
  const contacts = (site.contacts || []).map((item) => normalizeContact(item)).filter(Boolean).sort((a, b) => a.order - b.order);
  const cta = byId("contact-cta-links");
  const social = byId("social-links");
  cta.replaceChildren();
  social.replaceChildren();
  for (const contact of contacts) {
    const ctaLink = createExternalLink(contact.label, contact.href, "contact-link");
    const socialLink = createExternalLink(contact.label, contact.href, "social-link");
    if (ctaLink) cta.append(ctaLink);
    if (socialLink) social.append(socialLink);
  }
  if (!cta.children.length) cta.append(make("span", "empty-note", "سيتم إضافة قنوات التواصل بعد اعتماد روابط صالحة."));
  if (!social.children.length) social.append(make("span", "empty-note", "لا توجد روابط اجتماعية مفعّلة صالحة حاليًا."));
}

function renderPayments(site) {
  const list = byId("payment-list");
  list.replaceChildren();
  const payments = (site.paymentMethods || []).map(normalizePayment).filter(Boolean);
  if (!payments.length) list.append(make("span", "empty-note", "لا توجد وسائل دفع مفعّلة حاليًا."));
  for (const payment of payments) {
    const item = make("span", "payment-item");
    if (payment.asset) {
      const image = document.createElement("img");
      image.src = payment.asset;
      image.alt = "";
      image.loading = "lazy";
      image.width = 46;
      image.height = 32;
      item.append(image);
    }
    item.append(make("span", "payment-label", payment.label));
    list.append(item);
  }
}

function renderTerms(site) {
  const normalized = normalizeTerms(site.terms || { status: "not_inspected", rows: [] });
  const content = byId("terms-content");
  content.replaceChildren();
  if (normalized.rows.length) {
    byId("terms-note").textContent = "الشروط العامة من إعدادات Main Configuration:";
    for (const term of normalized.rows) content.append(make("p", "footer-term", term.text));
  } else {
    byId("terms-note").textContent = normalized.status === "empty" || normalized.status === "missing_headers"
      ? "لا توجد شروط عامة مفعّلة؛ راجع شروط كل مزود في صفحته."
      : "تعذر التحقق من الشروط العامة حاليًا.";
  }
}

function renderHeader(uiConfig) {
  const options = uiConfig.settings?.headerOptions || {};
  for (const element of document.querySelectorAll("[data-header-option]")) {
    const option = element.dataset.headerOption;
    if (Object.prototype.hasOwnProperty.call(options, option)) element.hidden = options[option] === false;
  }
}

function showLoadError() {
  renderProviders({ providers: [] }, {});
  byId("announcement-list").replaceChildren(make("p", "empty-note", "تعذر تحميل الإعلانات. ستظل بطاقات الشبكات الأربع ظاهرة؛ حاول التحديث لاحقًا."));
  byId("announcement-list").setAttribute("aria-busy", "false");
  byId("contact-cta-links").replaceChildren(make("span", "empty-note", "قنوات التواصل غير متاحة مؤقتًا."));
  byId("social-links").replaceChildren();
  byId("payment-list").replaceChildren(make("span", "empty-note", "وسائل الدفع غير متاحة مؤقتًا."));
  byId("terms-note").textContent = "المحتوى العام غير متاح مؤقتًا.";
  byId("router-status").textContent = "تعذر التحقق من بيانات الراوترات.";
}

async function loadUiConfig() {
  const response = await fetch(CONFIG_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Homepage UI configuration unavailable");
  const config = await response.json();
  if (config.schemaVersion !== 2) throw new Error("Unsupported homepage UI configuration");
  return config;
}

async function start() {
  byId("copyright-year").textContent = String(new Date().getFullYear());
  try {
    const uiConfig = await loadUiConfig();
    renderHeader(uiConfig);
    const [siteResult, routersResult] = await Promise.all([loadResource("site"), loadResource("routers").catch(() => null)]);
    renderSourceBanner(byId("data-mode-banner"), siteResult);
    renderProviders(siteResult.payload, uiConfig);
    renderRouterSection(siteResult.payload, routersResult?.payload);
    renderAnnouncements(siteResult.payload);
    renderContacts(siteResult.payload);
    renderPayments(siteResult.payload);
    renderTerms(siteResult.payload);
    if (siteResult.sourceMode === "live") {
      refreshTimer = window.setTimeout(() => start().catch(showLoadError), refreshSeconds(siteResult.payload, 15) * 1000);
    }
    window.addEventListener("online", () => start().catch(showLoadError), { once: true });
  } catch (error) {
    console.error("OMV homepage data could not be loaded", error);
    showLoadError();
  }
}

start();
