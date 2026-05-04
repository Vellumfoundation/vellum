import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const chainConfigPath = process.env.STATUS_CHAIN_CONFIG_PATH || resolve(repoRoot, "chain/configs/testnet/chain.json");
const chain = JSON.parse(readFileSync(chainConfigPath, "utf8"));
const port = Number(process.env.STATUS_PORT || 8787);
const requestTimeoutMs = Number(process.env.STATUS_REQUEST_TIMEOUT_MS || 5_000);

const config = {
  rpcUrl: process.env.STATUS_RPC_URL || process.env.TESTNET_PUBLIC_RPC_URL || chain.rpcUrls.public,
  websocketRpcUrl: process.env.STATUS_WS_URL || process.env.TESTNET_WS_RPC_URL || chain.rpcUrls.websocket,
  explorerUrl: trimTrailingSlash(process.env.STATUS_EXPLORER_URL || process.env.EXPLORER_URL || chain.explorerUrl),
  bridgeUrl: trimTrailingSlash(process.env.STATUS_BRIDGE_URL || process.env.BRIDGE_URL || ""),
  faucetUrl: trimTrailingSlash(process.env.STATUS_FAUCET_URL || process.env.FAUCET_URL || ""),
  docsUrl: trimTrailingSlash(process.env.STATUS_DOCS_URL || process.env.DOCS_URL || "")
};

function trimTrailingSlash(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

function json(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(`${payload}\n`);
}

function html(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function statusRank(status) {
  if (status === "operational") return 0;
  if (status === "degraded") return 1;
  return 2;
}

function overallStatus(services) {
  const worst = services.reduce((current, service) => Math.max(current, statusRank(service.status)), 0);
  return worst === 0 ? "operational" : worst === 1 ? "degraded" : "unavailable";
}

async function withTiming(label, check) {
  const started = Date.now();
  try {
    const result = await check();
    return {
      name: label,
      latencyMs: Date.now() - started,
      ...result
    };
  } catch (error) {
    return {
      name: label,
      status: "unavailable",
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function rpc(method, params = []) {
  const response = await fetchWithTimeout(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC returned an error");
  return payload.result;
}

async function checkRpc() {
  if (!config.rpcUrl) throw new Error("STATUS_RPC_URL is not configured");
  const [chainIdHex, blockNumberHex] = await Promise.all([rpc("eth_chainId"), rpc("eth_blockNumber")]);
  const chainId = Number.parseInt(chainIdHex, 16);
  const blockNumber = Number.parseInt(blockNumberHex, 16);
  const status = chainId === chain.chainId && blockNumber > 0 ? "operational" : "degraded";
  return {
    status,
    url: config.rpcUrl,
    chainId,
    blockNumber,
    detail: status === "operational" ? "RPC is serving the expected Vellum testnet chain." : `Expected chain ${chain.chainId}.`
  };
}

async function checkExplorer() {
  if (!config.explorerUrl) {
    return { status: "degraded", detail: "Explorer URL is not configured." };
  }
  const response = await fetchWithTimeout(`${config.explorerUrl}/api/v2/main-page/indexing-status`);
  if (!response.ok) throw new Error(`Explorer HTTP ${response.status}`);
  return {
    status: "operational",
    url: config.explorerUrl,
    detail: "Explorer API responded."
  };
}

async function checkHttpService(name, url) {
  if (!url) {
    return {
      name,
      status: "degraded",
      detail: `${name} URL is not configured.`
    };
  }
  const response = await fetchWithTimeout(url, { method: "GET" });
  return {
    name,
    status: response.ok ? "operational" : "degraded",
    url,
    detail: response.ok ? `${name} responded.` : `${name} returned HTTP ${response.status}.`
  };
}

async function buildStatus() {
  const services = await Promise.all([
    withTiming("Public RPC", checkRpc),
    withTiming("Block explorer", checkExplorer),
    withTiming("Bridge UI", () => checkHttpService("Bridge UI", config.bridgeUrl)),
    withTiming("Faucet", () => checkHttpService("Faucet", config.faucetUrl)),
    withTiming("Docs", () => checkHttpService("Docs", config.docsUrl))
  ]);

  return {
    generatedAt: new Date().toISOString(),
    network: {
      name: "Vellum Testnet",
      chainId: chain.chainId,
      chainIdHex: chain.chainIdHex,
      parentChain: chain.parentChain,
      nativeCurrency: chain.nativeCurrency,
      rpcUrl: config.rpcUrl,
      websocketRpcUrl: config.websocketRpcUrl
    },
    overallStatus: overallStatus(services),
    services
  };
}

function renderPage(status) {
  const rows = status.services
    .map(
      (service) => `<tr>
        <td>${escapeHtml(service.name)}</td>
        <td><span class="pill ${service.status}">${escapeHtml(service.status)}</span></td>
        <td>${service.latencyMs} ms</td>
        <td>${escapeHtml(service.detail || "")}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vellum Testnet Status</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f6f7f9; color: #171a1f; }
      main { max-width: 980px; margin: 0 auto; padding: 48px 20px; }
      h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: 0; }
      p { color: #4f5866; line-height: 1.55; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0; }
      .metric { border: 1px solid #d9dee7; background: #fff; border-radius: 8px; padding: 14px; }
      .label { display: block; color: #667085; font-size: 13px; margin-bottom: 6px; }
      .value { font-weight: 700; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9dee7; border-radius: 8px; overflow: hidden; }
      th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e7ebf0; vertical-align: top; }
      th { font-size: 13px; color: #667085; background: #f9fafb; }
      tr:last-child td { border-bottom: 0; }
      .pill { display: inline-block; min-width: 92px; text-align: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 700; }
      .operational { color: #0f5132; background: #d1e7dd; }
      .degraded { color: #664d03; background: #fff3cd; }
      .unavailable { color: #842029; background: #f8d7da; }
      footer { margin-top: 20px; font-size: 13px; color: #667085; }
      @media (prefers-color-scheme: dark) {
        body { background: #111318; color: #f8fafc; }
        p, .label, th, footer { color: #aab3c2; }
        .metric, table { background: #191d24; border-color: #303846; }
        th { background: #151922; }
        th, td { border-color: #303846; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Vellum Testnet Status</h1>
      <p>Live status for the Base Sepolia-settled Vellum testnet.</p>
      <section class="summary">
        <div class="metric"><span class="label">Overall</span><span class="value">${escapeHtml(status.overallStatus)}</span></div>
        <div class="metric"><span class="label">Chain ID</span><span class="value">${status.network.chainId}</span></div>
        <div class="metric"><span class="label">Parent</span><span class="value">${escapeHtml(status.network.parentChain.name)} ${status.network.parentChain.chainId}</span></div>
        <div class="metric"><span class="label">Native Gas</span><span class="value">${escapeHtml(status.network.nativeCurrency.symbol)}</span></div>
      </section>
      <table>
        <thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>Detail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <footer>Generated at ${escapeHtml(status.generatedAt)}. JSON is available at <code>/api/status</code>.</footer>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function serve(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/healthz") {
    const status = await buildStatus();
    json(res, 200, { ok: true, status: status.overallStatus });
    return;
  }
  if (url.pathname === "/api/status") {
    const status = await buildStatus();
    json(res, 200, status);
    return;
  }
  if (url.pathname === "/") {
    const status = await buildStatus();
    html(res, 200, renderPage(status));
    return;
  }
  json(res, 404, { error: "not_found" });
}

async function check() {
  const status = await buildStatus();
  console.log(JSON.stringify(status, null, 2));
}

if (process.argv.includes("--check")) {
  check().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  createServer((req, res) => {
    serve(req, res).catch((error) => json(res, 500, { error: error instanceof Error ? error.message : String(error) }));
  }).listen(port, () => {
    console.log(`Vellum status service listening on http://127.0.0.1:${port}`);
  });
}
