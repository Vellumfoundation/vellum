import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, formatEther, isAddress, parseEther } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const chainConfigPath = process.env.FAUCET_CHAIN_CONFIG_PATH || resolve(repoRoot, "chain/configs/testnet/chain.json");
const chain = JSON.parse(readFileSync(chainConfigPath, "utf8"));
const port = Number(process.env.FAUCET_PORT || 8788);
const enabled = process.env.TESTNET_FAUCET_ENABLED === "true" || process.env.FAUCET_ENABLED === "true";
const rpcUrl = process.env.FAUCET_RPC_URL || process.env.TESTNET_PUBLIC_RPC_URL || chain.rpcUrls.public;
const faucetPrivateKey = process.env.TESTNET_FAUCET_PRIVATE_KEY || process.env.FAUCET_PRIVATE_KEY || "";
const amountEth = process.env.FAUCET_AMOUNT_ETH || "0.01";
const amountWei = parseEther(amountEth);
const walletCooldownMs = Number(process.env.FAUCET_WALLET_COOLDOWN_SECONDS || 86_400) * 1000;
const ipCooldownMs = Number(process.env.FAUCET_IP_COOLDOWN_SECONDS || 3_600) * 1000;
const dailyBudgetWei = parseEther(process.env.FAUCET_DAILY_BUDGET_ETH || "1");
const maxBodyBytes = Number(process.env.FAUCET_MAX_BODY_BYTES || 16_384);

const walletRequests = new Map();
const ipRequests = new Map();
let currentBudgetDay = utcDay();
let spentTodayWei = 0n;

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function resetBudgetIfNeeded() {
  const day = utcDay();
  if (day !== currentBudgetDay) {
    currentBudgetDay = day;
    spentTodayWei = 0n;
  }
}

function json(res, statusCode, body) {
  const payload = JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": process.env.FAUCET_CORS_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
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

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function remainingCooldown(lastAt, cooldownMs) {
  if (!lastAt) return 0;
  return Math.max(0, cooldownMs - (Date.now() - lastAt));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) {
      throw new Error("Request body is too large.");
    }
  }
  return body ? JSON.parse(body) : {};
}

function assertTestnetConfig() {
  if (process.env.PROJECT_ENV === "mainnet" || process.env.PROJECT_ENV === "production") {
    throw new Error("The faucet is blocked in mainnet and production environments.");
  }
  if (chain.chainId === 1 || chain.chainId === 8453) {
    throw new Error("The faucet chain config points at a mainnet chain.");
  }
  if (chain.nativeCurrency?.symbol !== "ETH") {
    throw new Error("Vellum faucet must dispense ETH only.");
  }
}

async function providerAndWallet() {
  assertTestnetConfig();
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chain.chainId) {
    throw new Error(`RPC chain ID ${network.chainId.toString()} does not match Vellum testnet ${chain.chainId}.`);
  }
  if (!faucetPrivateKey) {
    throw new Error("TESTNET_FAUCET_PRIVATE_KEY is not configured.");
  }
  return {
    provider,
    wallet: new Wallet(faucetPrivateKey, provider)
  };
}

async function statusPayload() {
  assertTestnetConfig();
  let chainId = null;
  let blockNumber = null;
  let faucetAddress = null;
  let faucetBalanceEth = null;
  let sendReady = enabled && Boolean(faucetPrivateKey);

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const [network, latestBlock] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
    chainId = Number(network.chainId);
    blockNumber = latestBlock;
    if (faucetPrivateKey) {
      const wallet = new Wallet(faucetPrivateKey, provider);
      faucetAddress = wallet.address;
      faucetBalanceEth = formatEther(await provider.getBalance(wallet.address));
    }
    sendReady = sendReady && chainId === chain.chainId;
  } catch (error) {
    sendReady = false;
  }

  resetBudgetIfNeeded();
  return {
    enabled,
    sendReady,
    network: {
      name: "Vellum Testnet",
      chainId: chain.chainId,
      observedChainId: chainId,
      blockNumber,
      rpcUrl,
      nativeCurrency: chain.nativeCurrency
    },
    faucet: {
      address: faucetAddress,
      amountEth,
      balanceEth: faucetBalanceEth,
      walletCooldownSeconds: Math.floor(walletCooldownMs / 1000),
      ipCooldownSeconds: Math.floor(ipCooldownMs / 1000),
      dailyBudgetEth: formatEther(dailyBudgetWei),
      spentTodayEth: formatEther(spentTodayWei)
    }
  };
}

async function requestFunds(req) {
  if (!enabled) {
    return {
      statusCode: 503,
      body: { error: "faucet_disabled", detail: "Set TESTNET_FAUCET_ENABLED=true to allow testnet faucet sends." }
    };
  }

  const payload = await readBody(req);
  const address = String(payload.address || "").trim();
  if (!isAddress(address)) {
    return { statusCode: 400, body: { error: "invalid_address" } };
  }

  const ip = clientIp(req);
  const walletCooldownRemaining = remainingCooldown(walletRequests.get(address.toLowerCase()), walletCooldownMs);
  const ipCooldownRemaining = remainingCooldown(ipRequests.get(ip), ipCooldownMs);
  if (walletCooldownRemaining > 0 || ipCooldownRemaining > 0) {
    return {
      statusCode: 429,
      body: {
        error: "rate_limited",
        walletCooldownRemainingSeconds: Math.ceil(walletCooldownRemaining / 1000),
        ipCooldownRemainingSeconds: Math.ceil(ipCooldownRemaining / 1000)
      }
    };
  }

  resetBudgetIfNeeded();
  if (spentTodayWei + amountWei > dailyBudgetWei) {
    return {
      statusCode: 429,
      body: {
        error: "daily_budget_exhausted",
        dailyBudgetEth: formatEther(dailyBudgetWei),
        spentTodayEth: formatEther(spentTodayWei)
      }
    };
  }

  const { wallet } = await providerAndWallet();
  const tx = await wallet.sendTransaction({ to: address, value: amountWei });
  walletRequests.set(address.toLowerCase(), Date.now());
  ipRequests.set(ip, Date.now());
  spentTodayWei += amountWei;

  return {
    statusCode: 200,
    body: {
      txHash: tx.hash,
      to: address,
      amountEth,
      chainId: chain.chainId,
      faucet: wallet.address
    }
  };
}

function renderPage(status) {
  const canRequest = status.enabled ? "enabled" : "disabled";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vellum Testnet Faucet</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f6f7f9; color: #171a1f; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 20px; }
      h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: 0; }
      p { color: #4f5866; line-height: 1.55; }
      form, .panel { border: 1px solid #d9dee7; background: #fff; border-radius: 8px; padding: 16px; margin-top: 18px; }
      label { display: block; font-weight: 700; margin-bottom: 8px; }
      input { box-sizing: border-box; width: 100%; min-height: 42px; border: 1px solid #c8d0dc; border-radius: 6px; padding: 8px 10px; font: inherit; }
      button { margin-top: 12px; min-height: 42px; border: 0; border-radius: 6px; padding: 0 14px; background: #155eef; color: #fff; font-weight: 700; cursor: pointer; }
      button:disabled { background: #9aa4b2; cursor: not-allowed; }
      code, pre { overflow-wrap: anywhere; white-space: pre-wrap; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
      .label { display: block; color: #667085; font-size: 13px; margin-bottom: 4px; }
      .value { font-weight: 700; overflow-wrap: anywhere; }
      @media (prefers-color-scheme: dark) {
        body { background: #111318; color: #f8fafc; }
        p, .label { color: #aab3c2; }
        form, .panel { background: #191d24; border-color: #303846; }
        input { background: #111318; color: #f8fafc; border-color: #3e4757; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Vellum Testnet Faucet</h1>
      <p>Request ${escapeHtml(status.faucet.amountEth)} ETH for Vellum testnet gas. The faucet is ${escapeHtml(canRequest)} and only targets chain ${status.network.chainId}.</p>
      <section class="panel grid">
        <div><span class="label">Observed Chain</span><span class="value">${escapeHtml(status.network.observedChainId ?? "unavailable")}</span></div>
        <div><span class="label">Latest Block</span><span class="value">${escapeHtml(status.network.blockNumber ?? "unavailable")}</span></div>
        <div><span class="label">Daily Budget</span><span class="value">${escapeHtml(status.faucet.dailyBudgetEth)} ETH</span></div>
        <div><span class="label">Spent Today</span><span class="value">${escapeHtml(status.faucet.spentTodayEth)} ETH</span></div>
      </section>
      <form id="request-form">
        <label for="address">Wallet address</label>
        <input id="address" name="address" placeholder="0x..." autocomplete="off" />
        <button type="submit"${status.enabled ? "" : " disabled"}>Request ETH</button>
        <pre id="result"></pre>
      </form>
      <script>
        const form = document.getElementById("request-form");
        const result = document.getElementById("result");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          result.textContent = "Sending request...";
          const address = new FormData(form).get("address");
          const response = await fetch("/api/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address })
          });
          result.textContent = JSON.stringify(await response.json(), null, 2);
        });
      </script>
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
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    const status = await statusPayload();
    json(res, status.sendReady ? 200 : 503, { ok: status.sendReady, enabled: status.enabled, chainId: chain.chainId });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    json(res, 200, await statusPayload());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/request") {
    const result = await requestFunds(req);
    json(res, result.statusCode, result.body);
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    html(res, 200, renderPage(await statusPayload()));
    return;
  }
  json(res, 404, { error: "not_found" });
}

async function check() {
  console.log(JSON.stringify(await statusPayload(), null, 2));
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
    console.log(`Vellum faucet service listening on http://127.0.0.1:${port}`);
  });
}
