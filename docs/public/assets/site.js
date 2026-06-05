const siteConfig = window.__PIRE_SITE__ || {};
const copyPageButton = document.querySelector("[data-copy-page]");
const pageMarkdownScript = document.querySelector("[data-page-markdown]");
const searchDialog = document.querySelector("[data-search-dialog]");
const searchInput = document.querySelector("[data-search-input]");
const searchResults = document.querySelector("[data-search-results]");
const searchOpenButtons = Array.from(document.querySelectorAll("[data-search-open]"));
const menuToggle = document.querySelector("[data-menu-toggle]");
const menuClose = document.querySelector("[data-menu-close]");
const sheet = document.querySelector(".mobile-sheet");
const sheetBackdrop = document.querySelector("[data-sheet-backdrop]");
const themeToggle = document.querySelector("[data-theme-toggle]");

let searchIndex = null;
let selectedResult = 0;
let previousFocus = null;
let previousSheetFocus = null;

async function writeClipboard(text) {
  await navigator.clipboard.writeText(text);
}

function setButtonLabel(button, label, delay = 1300) {
  const span = button?.querySelector("span");
  if (!span) return;
  const original = span.textContent;
  span.textContent = label;
  window.setTimeout(() => {
    span.textContent = original;
  }, delay);
}

copyPageButton?.addEventListener("click", async () => {
  try {
    const markdown = JSON.parse(pageMarkdownScript?.textContent || "\"\"");
    await writeClipboard(markdown);
    setButtonLabel(copyPageButton, "Copied");
  } catch {
    setButtonLabel(copyPageButton, "Select text");
  }
});

for (const button of document.querySelectorAll("[data-copy-code]")) {
  button.addEventListener("click", async () => {
    const code = button.parentElement?.querySelector("code")?.innerText || "";
    try {
      await writeClipboard(code);
      button.dataset.copied = "true";
    } catch {
      button.dataset.copied = "false";
    }
    window.setTimeout(() => {
      delete button.dataset.copied;
    }, 1200);
  });
}

function storedTheme() {
  return localStorage.getItem("theme") || "dark";
}

function applyTheme(theme) {
  const resolved =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(resolved === "light" ? "light" : "dark");
  document.documentElement.style.colorScheme = resolved === "light" ? "light" : "dark";
  themeToggle?.setAttribute("aria-label", `Theme: ${theme}`);
}

themeToggle?.addEventListener("click", () => {
  const next = storedTheme() === "dark" ? "light" : storedTheme() === "light" ? "system" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

applyTheme(storedTheme());

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (storedTheme() === "system") {
    applyTheme("system");
  }
});

function routeUrl(path, hash = "") {
  const basePath = siteConfig.basePath || "";
  if (basePath && window.location.pathname.startsWith(`${basePath}/`)) {
    return `${basePath}${path}${hash}`;
  }
  return `${path}${hash}`;
}

async function loadSearchIndex() {
  if (searchIndex) {
    return searchIndex;
  }
  const response = await fetch(siteConfig.searchIndex || "assets/search-index.json");
  searchIndex = await response.json();
  return searchIndex;
}

function scoreEntry(entry, query) {
  if (!query) return 1;
  const haystack = `${entry.title} ${entry.section} ${entry.text}`.toLowerCase();
  const title = entry.title.toLowerCase();
  const section = entry.section.toLowerCase();
  let score = 0;
  for (const part of query.split(/\s+/).filter(Boolean)) {
    if (title.includes(part)) score += 8;
    if (section.includes(part)) score += 4;
    if (haystack.includes(part)) score += 1;
  }
  return score;
}

function resultButton(entry, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result";
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", index === selectedResult ? "true" : "false");
  button.dataset.index = String(index);
  const meta = `${escapeForHtml(entry.section)}${entry.hash ? ` - ${escapeForHtml(entry.hash.slice(1))}` : ""}`;
  const snippet = entry.snippet ? `<small>${escapeForHtml(entry.snippet)}</small>` : "";
  button.innerHTML = `<strong>${escapeForHtml(entry.title)}</strong><span>${meta}</span>${snippet}`;
  button.addEventListener("click", () => {
    window.location.href = routeUrl(entry.path, entry.hash);
  });
  return button;
}

function escapeForHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderSearchResults() {
  const index = await loadSearchIndex();
  const query = (searchInput?.value || "").trim().toLowerCase();
  const results = index
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 12)
    .map((item) => item.entry);

  selectedResult = Math.min(selectedResult, Math.max(results.length - 1, 0));
  searchResults.innerHTML = "";
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "No docs found";
    searchResults.append(empty);
    return;
  }

  results.forEach((entry, index) => searchResults.append(resultButton(entry, index)));
}

function updateSelectedResult(nextIndex) {
  const buttons = Array.from(searchResults.querySelectorAll(".search-result"));
  if (buttons.length === 0) return;
  selectedResult = (nextIndex + buttons.length) % buttons.length;
  buttons.forEach((button, index) => {
    button.setAttribute("aria-selected", index === selectedResult ? "true" : "false");
  });
  buttons[selectedResult]?.scrollIntoView({ block: "nearest" });
}

async function openSearch(query = "") {
  previousFocus = document.activeElement;
  searchDialog.hidden = false;
  document.body.classList.add("search-open");
  if (searchInput) {
    searchInput.value = query;
  }
  selectedResult = 0;
  await renderSearchResults();
  window.setTimeout(() => searchInput?.focus(), 0);
}

function closeSearch() {
  if (!searchDialog || searchDialog.hidden) return;
  searchDialog.hidden = true;
  document.body.classList.remove("search-open");
  previousFocus?.focus?.();
}

for (const button of searchOpenButtons) {
  button.addEventListener("click", () => openSearch());
}

searchDialog?.addEventListener("click", (event) => {
  if (event.target === searchDialog) {
    closeSearch();
  }
});

searchInput?.addEventListener("input", () => {
  selectedResult = 0;
  renderSearchResults();
});

searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateSelectedResult(selectedResult + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    updateSelectedResult(selectedResult - 1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const selected = searchResults.querySelector(`.search-result[data-index="${selectedResult}"]`);
    selected?.click();
  }
});

function focusableIn(element) {
  return Array.from(
    element.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}

function openSheet() {
  previousSheetFocus = document.activeElement;
  sheet.hidden = false;
  sheetBackdrop.hidden = false;
  document.body.classList.add("menu-open");
  menuToggle?.setAttribute("aria-expanded", "true");
  window.setTimeout(() => focusableIn(sheet)[0]?.focus(), 0);
}

function closeSheet() {
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  sheetBackdrop.hidden = true;
  document.body.classList.remove("menu-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  previousSheetFocus?.focus?.();
}

menuToggle?.addEventListener("click", () => {
  if (sheet?.hidden) {
    openSheet();
  } else {
    closeSheet();
  }
});

menuClose?.addEventListener("click", closeSheet);
sheetBackdrop?.addEventListener("click", closeSheet);

for (const link of document.querySelectorAll(".mobile-sheet a")) {
  link.addEventListener("click", closeSheet);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "k") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape") {
    closeSearch();
    closeSheet();
  }
  if (event.key === "Tab" && sheet && !sheet.hidden) {
    const focusable = focusableIn(sheet);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
