import { legacyProviderId, providerIdentity, rowValue } from "../data/provider-adapters.js";
import { providerVisual } from "../provider-page-ui.js";
import { createSourceBadgeSlot, sourceBadgeText } from "./source-badges.js";

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const AVAILABLE_ROUTER_IMAGES = new Set(["we/TE_RTR_201.jpg"]);
let routerDetailsSequence = 0;

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)
    : "";
}

function routerId(record) {
  return String(record?.routerId ?? record?.routerID ?? rowValue(record, ["Router ID", "id"]) ?? "").trim();
}

export function routerImagePath(record) {
  const id = routerId(record);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return "";
  const identity = providerIdentity(record?.providerId ?? record?.canonicalProviderId, record?.providerName);
  if (!identity.canonicalId) return "";
  const asset = `${identity.slug}/${id}.jpg`;
  return AVAILABLE_ROUTER_IMAGES.has(asset) ? `/assets/routers/${asset}` : "";
}

export function routerSectionEnabled(section) {
  return section?.enabled === true;
}

export function routerBelongsToProvider(router, selectedProviderId) {
  if (selectedProviderId === "all") return true;
  const id = router?.providerLegacyId ?? router?.providerId ?? router?.canonicalProviderId;
  return String(legacyProviderId(id) ?? "") === String(selectedProviderId);
}

export function routerPriceDisplay(router) {
  const finalPrice = money(router?.finalPrice);
  const rawDiscountPrice = router?.showOffer === true ? money(router?.discountPrice) : "";
  const discountPrice = rawDiscountPrice && finalPrice && Number(router.discountPrice) < Number(router.finalPrice)
    ? rawDiscountPrice
    : "";
  return { finalPrice, discountPrice };
}

export function createRouterSourceTableLoader(loadProviderResource) {
  const tablesByProvider = new Map();
  return {
    clear() {
      tablesByProvider.clear();
    },
    load(providerId) {
      const key = providerIdentity(providerId).canonicalId;
      if (!key) return Promise.resolve(null);
      if (!tablesByProvider.has(key)) {
        const request = Promise.resolve()
          .then(() => loadProviderResource(providerId))
          .then((result) => result.payload?.tables?.routers || null)
          .catch(() => null);
        tablesByProvider.set(key, request);
      }
      return tablesByProvider.get(key);
    },
  };
}

export function enrichRouterRows(records, sourceTable) {
  const sourceById = new Map();
  const duplicates = new Set();
  for (const row of Array.isArray(sourceTable?.rows) ? sourceTable.rows : []) {
    const id = String(rowValue(row, ["Router ID", "routerId"]) ?? "").trim();
    if (!id) continue;
    if (sourceById.has(id)) duplicates.add(id);
    else sourceById.set(id, row);
  }
  duplicates.forEach((id) => sourceById.delete(id));

  return (Array.isArray(records) ? records : []).map((record) => {
    const source = sourceById.get(routerId(record));
    if (!source) return { ...record };
    return {
      ...record,
      firstBadge: sourceBadgeText(source, "first"),
      secondBadge: sourceBadgeText(source, "second"),
    };
  });
}

function appendImage(card, router) {
  const src = routerImagePath(router);
  if (!src) return;
  const frame = make("div", "router-image-frame");
  const image = make("img", "router-image");
  image.src = src;
  image.alt = String(router.name || "");
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => frame.remove(), { once: true });
  frame.append(image);
  card.append(frame);
}

function appendDetails(card, details) {
  if (!Array.isArray(details) || !details.length) return;
  const list = make("div", "router-details");
  list.id = `router-details-${++routerDetailsSequence}`;
  list.hidden = true;
  for (const detail of details) {
    const item = make("div", "router-detail");
    const title = [detail.section, detail.title].filter(Boolean).join(" — ");
    if (title) item.append(make("strong", "", title));
    if (detail.content) item.append(make("p", "", detail.content));
    list.append(item);
  }
  const toggle = make("button", "router-details-toggle", "عرض التفاصيل");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", list.id);
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.textContent = expanded ? "عرض التفاصيل" : "إخفاء التفاصيل";
    list.hidden = expanded;
  });
  card.append(toggle, list);
}

export function createRouterCard(router) {
  const card = make("article", "catalog-card router-card");
  const identity = providerIdentity(router.providerId ?? router.canonicalProviderId, router.providerName);
  const visual = providerVisual(identity);
  if (visual?.color) card.style.setProperty("--accent", visual.color);

  const firstBadge = createSourceBadgeSlot(router, "first");
  if (firstBadge) card.append(firstBadge);

  const top = make("div", "catalog-card-top router-card-top");
  top.append(make("h3", "router-name router-card-title", String(router.name || "")));
  top.append(make("span", `router-provider provider-${identity.id}`, String(router.providerName || identity.nameAr)));
  card.append(top);
  appendImage(card, router);

  const facts = make("div", "catalog-facts router-card-facts");
  const basePrice = money(router.price);
  const increase = money(router.increase);
  if (basePrice) facts.append(make("span", "catalog-fact", `السعر الأساسي: ${basePrice} ج`));
  if (increase) facts.append(make("span", "catalog-fact", `الزيادة: ${increase} ج`));
  if (facts.childElementCount) card.append(facts);
  appendDetails(card, router.details);

  const price = make("div", "price-row router-price-row");
  const { finalPrice, discountPrice } = routerPriceDisplay(router);
  if (discountPrice) {
    price.append(
      make("span", "price-old", `${finalPrice} ج`),
      make("strong", "price-current", `${discountPrice} ج`),
      make("span", "offer-chip", "عرض"),
    );
  } else if (finalPrice) price.append(make("strong", "price-current", `${finalPrice} ج`));
  else price.append(make("span", "price-unit", "السعر النهائي غير متاح"));
  card.append(price);

  const secondBadge = createSourceBadgeSlot(router, "second");
  if (secondBadge) card.append(secondBadge);
  return card;
}
