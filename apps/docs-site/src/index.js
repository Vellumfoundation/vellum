import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const docsRoot = resolve(process.env.DOCS_SOURCE_DIR || join(repoRoot, "docs"));
const port = Number(process.env.DOCS_PORT || 3003);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, files);
    } else if (entry.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function titleFromMarkdown(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback.replace(/-/g, " ");
}

function docsIndex() {
  return walk(docsRoot)
    .map((file) => {
      const relativePath = relative(docsRoot, file);
      const markdown = readFileSync(file, "utf8");
      return {
        title: titleFromMarkdown(markdown, relativePath.replace(/\.md$/, "")),
        path: relativePath,
        href: `/docs/${relativePath.replace(/\.md$/, "")}`
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const safeHref = String(href).startsWith("http") || String(href).startsWith("/") ? href : `/docs/${String(href).replace(/\.md$/, "")}`;
      return `<a href="${escapeHtml(safeHref)}">${escapeHtml(label)}</a>`;
    });
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let inList = false;
  let inTable = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function closeTable() {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("```")) {
      closeList();
      closeTable();
      if (inCode) {
        html.push("</code></pre>");
      } else {
        html.push("<pre><code>");
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      closeTable();
      continue;
    }

    if (line.startsWith("|") && lines[index + 1]?.startsWith("|---")) {
      closeList();
      closeTable();
      const cells = line.split("|").slice(1, -1).map((cell) => `<th>${renderInline(cell.trim())}</th>`).join("");
      html.push(`<table><thead><tr>${cells}</tr></thead><tbody>`);
      inTable = true;
      index += 1;
      continue;
    }

    if (inTable && line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((cell) => `<td>${renderInline(cell.trim())}</td>`).join("");
      html.push(`<tr>${cells}</tr>`);
      continue;
    }

    closeTable();

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  closeTable();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

function layout(title, body, nav = docsIndex()) {
  const navItems = nav.map((item) => `<a href="${item.href}">${escapeHtml(item.title)}</a>`).join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Vellum Docs</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f6f7f9; color: #171a1f; }
      .shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
      nav { border-right: 1px solid #d9dee7; background: #fff; padding: 22px; overflow: auto; }
      nav strong { display: block; margin-bottom: 14px; }
      nav a { display: block; color: #344054; text-decoration: none; padding: 7px 0; font-size: 14px; }
      nav a:hover { color: #155eef; }
      main { max-width: 920px; padding: 42px 28px 64px; }
      h1 { font-size: 34px; margin: 0 0 16px; letter-spacing: 0; }
      h2 { margin-top: 34px; }
      p, li { color: #344054; line-height: 1.65; }
      a { color: #155eef; }
      code { background: #edf1f7; border-radius: 4px; padding: 2px 4px; }
      pre { background: #111827; color: #f9fafb; border-radius: 8px; padding: 16px; overflow: auto; }
      pre code { background: transparent; padding: 0; }
      table { width: 100%; border-collapse: collapse; margin: 18px 0; background: #fff; border: 1px solid #d9dee7; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e7ebf0; vertical-align: top; }
      th { background: #f9fafb; color: #667085; }
      @media (max-width: 820px) {
        .shell { display: block; }
        nav { border-right: 0; border-bottom: 1px solid #d9dee7; max-height: 240px; }
      }
      @media (prefers-color-scheme: dark) {
        body { background: #111318; color: #f8fafc; }
        nav, table { background: #191d24; border-color: #303846; }
        nav a, p, li { color: #c8d0dc; }
        th, td { border-color: #303846; }
        th, code { background: #151922; color: #dbe3ef; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav><strong>Vellum Docs</strong>${navItems}</nav>
      <main>${body}</main>
    </div>
  </body>
</html>`;
}

function resolveDoc(pathname) {
  const normalized = decodeURIComponent(pathname.replace(/^\/docs\/?/, "") || "overview");
  const candidate = resolve(docsRoot, `${normalized.replace(/\/$/, "")}.md`);
  if (!candidate.startsWith(docsRoot) || !existsSync(candidate) || extname(candidate) !== ".md") {
    return null;
  }
  return candidate;
}

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function serve(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/healthz") {
    send(res, 200, "application/json", JSON.stringify({ ok: true, docs: docsIndex().length }, null, 2));
    return;
  }
  if (url.pathname === "/api/docs") {
    send(res, 200, "application/json", JSON.stringify(docsIndex(), null, 2));
    return;
  }
  if (url.pathname === "/") {
    const index = docsIndex();
    const items = index.map((item) => `<li><a href="${item.href}">${escapeHtml(item.title)}</a></li>`).join("");
    send(res, 200, "text/html", layout("Vellum Docs", `<h1>Vellum Docs</h1><p>Developer, operator, bridge, and launch documentation for Vellum.</p><ul>${items}</ul>`, index));
    return;
  }
  if (url.pathname.startsWith("/docs")) {
    const file = resolveDoc(url.pathname);
    if (!file) {
      send(res, 404, "text/html", layout("Not Found", "<h1>Not Found</h1><p>The requested doc page does not exist.</p>"));
      return;
    }
    const markdown = readFileSync(file, "utf8");
    send(res, 200, "text/html", layout(titleFromMarkdown(markdown, "Vellum Docs"), renderMarkdown(markdown)));
    return;
  }
  send(res, 404, "application/json", JSON.stringify({ error: "not_found" }));
}

function check() {
  const pages = docsIndex();
  if (pages.length === 0) {
    throw new Error(`No Markdown docs found in ${docsRoot}`);
  }
  console.log(JSON.stringify({ ok: true, docsRoot, pages: pages.length }, null, 2));
}

if (process.argv.includes("--check")) {
  try {
    check();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
} else {
  createServer((req, res) => {
    serve(req, res).catch((error) => {
      send(res, 500, "application/json", JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  }).listen(port, () => {
    console.log(`Vellum docs site listening on http://127.0.0.1:${port}`);
  });
}
