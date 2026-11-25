const dialog = document.getElementById("terms-dialog");
const trigger = document.getElementById("terms-trigger");
const content = document.getElementById("terms-dialog-content");
const title = document.getElementById("terms-dialog-title");
const sourceList = document.getElementById("we-terms-list") || document.getElementById("provider-terms-list");
const sourceEmpty = document.getElementById("we-terms-empty") || document.getElementById("provider-terms-empty");

if (dialog && trigger && content) {
  const syncTerms = () => {
    content.replaceChildren();
    const items = sourceList ? [...sourceList.children].map((item) => item.cloneNode(true)) : [];
    if (items.length) {
      content.append(...items);
      return;
    }
    const note = document.createElement("p");
    note.className = "terms-dialog-empty";
    note.textContent = sourceEmpty?.textContent?.trim() || "لا توجد شروط مفعّلة ومدخلة من المصدر حاليًا.";
    content.append(note);
  };

  trigger.addEventListener("click", () => {
    syncTerms();
    const providerTitle = document.getElementById("provider-title")?.textContent?.trim();
    if (title && providerTitle) title.textContent = `الشروط والأحكام — ${providerTitle}`;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  dialog.querySelector("[data-terms-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("cancel", () => dialog.close());
}
