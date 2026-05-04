import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { Readable } from "node:stream";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasLiveRpc, liveRequired, requireLiveRpc, rpcUrl } from "./lib/live";

const chainId = "0x15ff7";

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string };
};

type ReadyResponse = {
  ready: boolean;
  upstream?: string;
};

type GatewayProcess = ChildProcessByStdio<null, Readable, Readable>;

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const body = await response.json() as JsonRpcResponse<T>;

  assert.equal(response.ok, true, `${method} HTTP request failed with ${response.status}`);
  assert.equal(body.error, undefined, body.error?.message);
  assert.ok("result" in body, `${method} response should include result`);
  return body.result as T;
}

async function waitForLiveBlockAtLeast(target: bigint): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    const blockNumber = await rpc<string>(rpcUrl, "eth_blockNumber");
    if (BigInt(blockNumber) >= target) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  assert.fail(`live devnet did not reach block ${target}`);
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object", "server should have a TCP address");
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  server.close();
  await once(server, "close");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
  }
  return body;
}

async function startLaggingUpstream(blockNumber = "0x1"): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const body = JSON.parse(await readRequestBody(request)) as { id?: number | string | null; method?: string };
    const result = body.method === "eth_chainId"
      ? chainId
      : body.method === "eth_blockNumber"
        ? blockNumber
        : undefined;

    response.writeHead(200, { "content-type": "application/json" });
    if (result) {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, result }));
      return;
    }

    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32099, message: "lagging upstream should not serve public traffic" }
    }));
  });
  const port = await listen(server);
  return { server, url: `http://127.0.0.1:${port}` };
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

function startGateway(port: number, upstreams: string[]): GatewayProcess {
  return spawn("pnpm", ["exec", "tsx", "rpc/gateway/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RPC_GATEWAY_PORT: String(port),
      RPC_UPSTREAMS: upstreams.join(","),
      RPC_EXPECTED_CHAIN_ID: chainId,
      RPC_MAX_BLOCK_LAG: "2",
      RPC_HEALTH_TIMEOUT_MS: "500",
      RPC_RATE_LIMIT_PER_MINUTE: "1000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function stopGateway(process: GatewayProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return;

  process.kill("SIGTERM");
  const exited = await Promise.race([
    once(process, "exit").then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000))
  ]);

  if (!exited) {
    process.kill("SIGKILL");
    await once(process, "exit");
  }
}

async function waitForReady(gatewayUrl: string, process: GatewayProcess): Promise<ReadyResponse> {
  const startedAt = Date.now();
  let output = "";
  process.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  process.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });

  while (Date.now() - startedAt < 20_000) {
    assert.equal(process.exitCode, null, `gateway exited early:\n${output}`);
    try {
      const response = await fetch(`${gatewayUrl}/ready`);
      const body = await response.json() as ReadyResponse;
      if (response.ok && body.ready) return body;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  assert.fail(`gateway did not become ready:\n${output}`);
}

describe("RPC no-downtime", () => {
  it("skips a lagging upstream and continues serving wallet-compatible traffic", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);
    await waitForLiveBlockAtLeast(8n);

    const lagging = await startLaggingUpstream("0x1");
    const gatewayPort = await freePort();
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
    const gateway = startGateway(gatewayPort, [lagging.url, rpcUrl]);

    try {
      const ready = await waitForReady(gatewayUrl, gateway);
      assert.equal(ready.ready, true);
      assert.equal(ready.upstream, rpcUrl);

      const gatewayChainId = await rpc<string>(gatewayUrl, "eth_chainId");
      assert.equal(gatewayChainId, chainId);

      const blockNumber = await rpc<string>(gatewayUrl, "eth_blockNumber");
      assert.ok(BigInt(blockNumber) > 1n, "gateway should serve the non-lagging upstream block number");

      const clientVersion = await rpc<string>(gatewayUrl, "web3_clientVersion");
      assert.match(clientVersion, /geth|op-geth/i);

      const blocked = await fetch(gatewayUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "debug_traceTransaction", params: [] })
      });
      const blockedBody = await blocked.json() as JsonRpcResponse<never>;
      assert.equal(blocked.status, 403);
      assert.equal(blockedBody.error?.code, -32601);
    } finally {
      await stopGateway(gateway);
      await closeServer(lagging.server);
    }
  });
});
