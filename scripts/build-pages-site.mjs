import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { navGroups, pages, site } from "../docs/src/content.mjs";
import { commandRootStatus, forbiddenDocsPatterns } from "../docs/src/feature-status.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceAssetsDir = path.join(repoRoot, "docs", "public", "assets");
const outputDir = path.join(repoRoot, "site");

const pageByPath = new Map(pages.map((page) => [page.path, page]));

function assertSafeOutputDir() {
  const resolved = path.resolve(outputDir);
  if (path.basename(resolved) !== "site" || !resolved.startsWith(repoRoot + path.sep)) {
    throw new Error(`Refusing to write unexpected output directory: ${resolved}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function routeToFile(route) {
  if (route === "/") {
    return path.join(outputDir, "index.html");
  }
  return path.join(outputDir, route.replace(/^\/|\/$/g, ""), "index.html");
}

function routeDepth(route) {
  if (route === "/") {
    return 0;
  }
  return route.replace(/^\/|\/$/g, "").split("/").length;
}

function relativeUrl(fromRoute, toRoute) {
  const depth = routeDepth(fromRoute);
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  if (toRoute === "/") {
    return prefix || "./";
  }
  return `${prefix}${toRoute.replace(/^\//, "")}`;
}

function assetUrl(fromRoute, assetPath) {
  const depth = routeDepth(fromRoute);
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  return `${prefix}assets/${assetPath}`;
}

function canonicalUrl(route) {
  if (route === "/") {
    return `${site.canonicalOrigin}/`;
  }
  return `${site.canonicalOrigin}${route}`;
}

function headingId(text) {
  return text
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderAnchorHeading(level, text, id = headingId(text)) {
  return `<h${level} id="${escapeHtml(id)}" class="heading-anchor">${escapeHtml(text)}<a href="#${escapeHtml(id)}" aria-label="Link to this section">#</a></h${level}>`;
}

function highlightedToken(value, className) {
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function highlightMatches(value, tokenPattern, classify) {
  let output = "";
  let cursor = 0;
  for (const match of String(value).matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index || 0;
    output += escapeHtml(value.slice(cursor, index));
    output += highlightedToken(token, classify(token));
    cursor = index + token.length;
  }
  output += escapeHtml(value.slice(cursor));
  return output;
}

function splitShellComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && quote === '"') {
      index += 1;
      continue;
    }
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === "#") {
      return [line.slice(0, index), line.slice(index)];
    }
  }
  return [line, ""];
}

function highlightShellLine(line) {
  const [commandPart, commentPart] = splitShellComment(line);
  const tokenPattern =
    /"[^"]*"|'[^']*'|--[A-Za-z0-9][\w-]*|<[^>\n]+>|\$[A-Za-z_][A-Za-z0-9_]*|\b[A-Z][A-Z0-9_]*(?==)|\b(?:pire-browser|npm|npx|cargo|git|node|python|echo|cd|mkdir)\b|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g;
  const highlightedCommand = highlightMatches(commandPart, tokenPattern, (token) => {
    if (token.startsWith('"') || token.startsWith("'")) return "hl-string";
    if (token.startsWith("--")) return "hl-flag";
    if (token.startsWith("<")) return "hl-placeholder";
    if (token.startsWith("$") || /^[A-Z][A-Z0-9_]*$/.test(token)) return "hl-variable";
    if (/^(true|false|null)$/.test(token)) return "hl-literal";
    if (/^-?\d/.test(token)) return "hl-number";
    return "hl-command";
  });
  return `${highlightedCommand}${commentPart ? highlightedToken(commentPart, "hl-comment") : ""}`;
}

function highlightShell(value) {
  return String(value).split("\n").map(highlightShellLine).join("\n");
}

function highlightJson(value) {
  const tokenPattern = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g;
  let output = "";
  let cursor = 0;
  for (const match of String(value).matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index || 0;
    const rest = value.slice(index + token.length);
    let className = "hl-punctuation";
    if (token.startsWith('"')) {
      className = rest.trimStart().startsWith(":") ? "hl-key" : "hl-string";
    } else if (/^(true|false|null)$/.test(token)) {
      className = "hl-literal";
    } else if (/^-?\d/.test(token)) {
      className = "hl-number";
    }
    output += escapeHtml(value.slice(cursor, index));
    output += highlightedToken(token, className);
    cursor = index + token.length;
  }
  output += escapeHtml(value.slice(cursor));
  return output;
}

function highlightCode(value, lang = "bash") {
  const trimmed = String(value).trimStart();
  if (lang === "json" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return highlightJson(value);
  }
  return highlightShell(value);
}

function renderCode(block) {
  return `<div class="code-block group">
  <button class="copy-code" type="button" data-copy-code aria-label="Copy code">
    <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
  </button>
  <pre tabindex="0"><code>${highlightCode(block.value, block.lang)}</code></pre>
</div>`;
}

const globalFlagsWithValue = new Set([
  "--action-policy",
  "--allowed-domains",
  "--color-scheme",
  "--config",
  "--confirm-actions",
  "--executable-path",
  "--max-output",
  "--profile",
  "--screenshot-dir",
  "--screenshot-format",
  "--screenshot-quality",
  "--session",
  "--session-name",
  "--state",
]);

const globalFlagsWithoutValue = new Set([
  "--allow-file-access",
  "--auto-connect",
  "--confirm-interactive",
  "--debug",
  "--headed",
  "--headless",
  "--json",
  "--no-allowed-domains",
]);

function tokeniseShellish(value) {
  return String(value).match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function commandRootFromTokens(tokens) {
  const start = tokens.findIndex((token) => token === "pire-browser");
  if (start < 0) {
    return null;
  }
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (globalFlagsWithValue.has(token)) {
      index += 1;
      continue;
    }
    if (globalFlagsWithoutValue.has(token)) {
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return token;
  }
  return null;
}

function commandRootsFromCode(value) {
  const roots = [];
  for (const rawLine of String(value).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("pire-browser")) {
      continue;
    }
    const root = commandRootFromTokens(tokeniseShellish(line));
    if (root) {
      roots.push(root);
    }
  }
  return roots;
}

function renderBlock(block) {
  switch (block.kind) {
    case "heading":
      return renderAnchorHeading(block.level, block.text, block.id);
    case "paragraph":
      return `<p>${block.html}</p>`;
    case "list":
      return `<ul>${block.items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    case "ordered-list":
      return `<ol>${block.items.map((item) => `<li>${item}</li>`).join("")}</ol>`;
    case "code":
      return renderCode(block);
    case "note":
      return `<div class="note note-${block.tone}">${block.html}</div>`;
    case "table":
      return `<div class="table-wrap"><table><thead><tr>${block.headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
    default:
      throw new Error(`Unknown block kind: ${block.kind}`);
  }
}

function renderBadge(page) {
  if (!page.badge) {
    return "";
  }
  return `<div class="page-badge">${escapeHtml(page.badge)}</div>`;
}

function blocksToMarkdown(page) {
  const lines = [`# ${page.title}`, ""];
  for (const block of page.blocks) {
    if (block.kind === "heading") {
      lines.push(`${"#".repeat(block.level)} ${block.text}`, "");
    } else if (block.kind === "paragraph" || block.kind === "note") {
      lines.push(stripHtml(block.html), "");
    } else if (block.kind === "list") {
      for (const item of block.items) {
        lines.push(`- ${stripHtml(item)}`);
      }
      lines.push("");
    } else if (block.kind === "ordered-list") {
      block.items.forEach((item, index) => lines.push(`${index + 1}. ${stripHtml(item)}`));
      lines.push("");
    } else if (block.kind === "code") {
      lines.push("```", block.value, "```", "");
    } else if (block.kind === "table") {
      lines.push(block.headers.map(stripHtml).join(" | "));
      lines.push(block.headers.map(() => "---").join(" | "));
      for (const row of block.rows) {
        lines.push(row.map(stripHtml).join(" | "));
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}

function blockToSearchText(block) {
  if (block.kind === "heading") {
    return block.text;
  }
  if (block.kind === "paragraph" || block.kind === "note") {
    return stripHtml(block.html);
  }
  if (block.kind === "list" || block.kind === "ordered-list") {
    return block.items.map(stripHtml).join(" ");
  }
  if (block.kind === "code") {
    return block.value;
  }
  if (block.kind === "table") {
    return [...block.headers, ...block.rows.flat()].map(stripHtml).join(" ");
  }
  return "";
}

function normalizeSearchText(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`|>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchSnippet(value, maxLength = 180) {
  const text = normalizeSearchText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}...`;
}

function pageHead(page) {
  const title = page.path === "/" ? `${site.name} | Browser Automation for AI` : `${page.title} | ${site.name}`;
  const description = page.description || site.description;
  const canonical = canonicalUrl(page.path);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="${escapeHtml(site.name)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="${assetUrl(page.path, "site.css")}">
<script>
(() => {
  const stored = localStorage.getItem("theme") || "dark";
  const resolved = stored === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : stored;
  document.documentElement.classList.add(resolved === "light" ? "light" : "dark");
  document.documentElement.style.colorScheme = resolved === "light" ? "light" : "dark";
})();
</script>`;
}

function renderHeader(page) {
  return `<header class="topbar">
  <div class="brand-wrap">
    <a class="brand-mark" href="${relativeUrl(page.path, "/")}" title="pire-browser home" aria-label="pire-browser home">
      <img src="${assetUrl(page.path, "pire-browser-logo.png")}" alt="" aria-hidden="true">
    </a>
    <span class="brand-divider" aria-hidden="true"></span>
    <a class="brand" href="${relativeUrl(page.path, "/")}" aria-label="pire-browser home">pire-browser</a>
  </div>
  <nav class="top-actions" aria-label="Site actions">
    <button class="search-button" type="button" data-search-open>
      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <span>Search docs</span>
      <kbd><span class="mac-key">&#8984;</span><span class="win-key">Ctrl</span>K</kbd>
    </button>
    <button class="search-icon-button" type="button" data-search-open aria-label="Search docs">
      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
    </button>
    <a class="github-link" href="${site.githubUrl}" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
      <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg>
      <span>GitHub</span>
    </a>
    <a class="npm-link" href="${site.npmUrl}" target="_blank" rel="noopener noreferrer">npm</a>
    <button class="theme-button" type="button" data-theme-toggle aria-label="Toggle theme">
      <svg class="theme-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>
      <svg class="theme-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>
    </button>
  </nav>
</header>`;
}

function renderNav(page, mobile = false) {
  return `<nav class="${mobile ? "mobile-nav" : "sidebar-nav"}" aria-label="Docs navigation">
${navGroups
  .map((group) => {
    const heading = group.label ? `<h4>${escapeHtml(group.label)}</h4>` : "";
    const links = group.links
      .map((link) => {
        const active = link.path === page.path;
        return `<li><a${active ? ' class="is-active"' : ""} href="${relativeUrl(page.path, link.path)}">${escapeHtml(link.title)}</a></li>`;
      })
      .join("");
    return `<div class="nav-group">${heading}<ul>${links}</ul></div>`;
  })
  .join("\n")}
</nav>`;
}

function renderSearch(page) {
  return `<div class="search-overlay" data-search-dialog hidden>
  <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search docs">
    <div class="search-input-wrap">
      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
      <input data-search-input type="search" placeholder="Search docs" autocomplete="off">
      <kbd>Esc</kbd>
    </div>
    <div class="search-results" data-search-results role="listbox" aria-label="Search results"></div>
  </div>
</div>
<script type="application/json" data-page-markdown>${JSON.stringify(blocksToMarkdown(page)).replaceAll("<", "\\u003c")}</script>
<script>window.__PIRE_SITE__ = ${JSON.stringify({
    searchIndex: assetUrl(page.path, "search-index.json"),
    basePath: site.basePath,
    currentPath: page.path,
  }).replaceAll("<", "\\u003c")};</script>
<script src="${assetUrl(page.path, "site.js")}" defer></script>`;
}

function renderMobileShell(page) {
  return `<button type="button" class="mobile-section-bar" data-menu-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="mobile-docs-menu">
  <span>${escapeHtml(page.navTitle || page.title)}</span>
  <span class="mobile-menu-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
  </span>
</button>
<div class="sheet-backdrop" data-sheet-backdrop hidden></div>
<aside class="mobile-sheet" id="mobile-docs-menu" role="dialog" aria-modal="true" aria-label="Docs navigation" hidden>
  <div class="sheet-header">
    <span>Docs</span>
    <button type="button" data-menu-close aria-label="Close navigation">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"></path></svg>
    </button>
  </div>
  ${renderNav(page, true)}
</aside>`;
}

function renderPage(page) {
  const article = page.blocks.map(renderBlock).join("\n");
  return `<!DOCTYPE html>
<html lang="en" class="no-js" data-site-base="${site.basePath}" data-current-path="${page.path}">
<head>
${pageHead(page)}
</head>
<body>
${renderHeader(page)}
${renderMobileShell(page)}
<main class="layout">
  <aside class="sidebar">
    ${renderNav(page)}
  </aside>
  <div class="content">
    <div class="page-actions">
      <button class="copy-page" type="button" data-copy-page aria-label="Copy page as Markdown">
        <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy Page</span>
      </button>
    </div>
    <article class="prose">
      ${renderBadge(page)}
      ${renderAnchorHeading(1, page.title, headingId(page.title))}
      ${article}
    </article>
  </div>
</main>
${renderSearch(page)}
</body>
</html>`;
}

function searchIndex() {
  const entries = [];
  for (const page of pages) {
    const pageText = page.blocks.map(blockToSearchText).join(" ");
    entries.push({
      title: page.navTitle || page.title,
      section: page.title,
      path: page.path,
      hash: "",
      text: normalizeSearchText(`${page.description || ""} ${pageText}`),
      snippet: searchSnippet(page.description || pageText),
    });
    let currentHeading = null;
    let currentText = [];
    const flushHeading = () => {
      if (!currentHeading) {
        return;
      }
      const text = currentText.join(" ");
      entries.push({
        title: currentHeading.text,
        section: page.navTitle || page.title,
        path: page.path,
        hash: `#${currentHeading.id || headingId(currentHeading.text)}`,
        text: normalizeSearchText(`${currentHeading.text} ${text}`),
        snippet: searchSnippet(text || currentHeading.text),
      });
    };
    for (const block of page.blocks) {
      if (block.kind === "heading") {
        flushHeading();
        currentHeading = block;
        currentText = [];
      } else if (currentHeading) {
        currentText.push(blockToSearchText(block));
      }
    }
    flushHeading();
  }
  return entries;
}

function render404() {
  const home = `${site.basePath}/`;
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${site.name}</title>
<link rel="stylesheet" href="${site.basePath}/assets/site.css">
</head>
<body class="center-page">
  <main class="not-found">
    <p class="eyebrow">404</p>
    <h1>Page not found</h1>
    <p>The docs route you opened does not exist in the pire-browser Pages site.</p>
    <a class="button" href="${home}">Go home</a>
  </main>
</body>
</html>`;
}

async function copyAsset(name) {
  const source = path.join(sourceAssetsDir, name);
  const target = path.join(outputDir, "assets", name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(source));
}

async function writeSite() {
  assertSafeOutputDir();
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, "assets"), { recursive: true });
  await writeFile(path.join(outputDir, ".nojekyll"), "\n");
  await copyAsset("geist-font-license.txt");
  await copyAsset("geist-pixel-square.woff2");
  await copyAsset("pire-browser-logo.png");
  await copyAsset("site.css");
  await copyAsset("site.js");
  await writeFile(path.join(outputDir, "assets", "search-index.json"), JSON.stringify(searchIndex(), null, 2));

  for (const page of pages) {
    const target = routeToFile(page.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, renderPage(page));
  }
  await writeFile(path.join(outputDir, "404.html"), render404());
}

async function validateSite() {
  const navPaths = navGroups.flatMap((group) => group.links.map((link) => link.path));
  for (const navPath of navPaths) {
    if (!pageByPath.has(navPath)) {
      throw new Error(`Navigation route has no page: ${navPath}`);
    }
  }
  for (const page of pages) {
    const html = await readFile(routeToFile(page.path), "utf8");
    for (const group of navGroups) {
      for (const link of group.links) {
        if (!html.includes(`>${escapeHtml(link.title)}</a>`)) {
          throw new Error(`${page.path} is missing sidebar label ${link.title}`);
        }
      }
    }
  }
  const commandsHtml = await readFile(routeToFile("/commands/"), "utf8");
  const commandsCodeBlocks = (commandsHtml.match(/class="code-block/g) || []).length;
  if (commandsCodeBlocks !== 42) {
    throw new Error(`Expected /commands/ to render 42 code blocks, got ${commandsCodeBlocks}`);
  }
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.kind !== "code") {
        continue;
      }
      for (const forbidden of forbiddenDocsPatterns) {
        if (block.value.includes(forbidden.pattern)) {
          throw new Error(`${page.path} documents unsupported pattern ${forbidden.pattern}: ${forbidden.reason}`);
        }
      }
      for (const root of commandRootsFromCode(block.value)) {
        if (commandRootStatus[root] === "not_available" && !block.notAvailable) {
          throw new Error(
            `${page.path} documents unavailable command root "${root}" as runnable. Mark the code block as notAvailable or change the copy.`,
          );
        }
      }
    }
  }
  const missingOutput = pages
    .map((page) => routeToFile(page.path))
    .filter((target) => !target.startsWith(outputDir));
  if (missingOutput.length > 0) {
    throw new Error(`Unexpected output paths: ${missingOutput.join(", ")}`);
  }
  console.log(`Built ${pages.length} docs routes with ${searchIndex().length} search entries.`);
}

await writeSite();
await validateSite();
