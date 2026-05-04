import type { IncomingMessage, ServerResponse } from "node:http";
import { getHealthyUpstream } from "./upstreams";
import { checkRateLimit } from "./rateLimit";

const blockedPublicMethods = new Set([
  "admin_addPeer",
  "admin_datadir",
  "admin_nodeInfo",
  "admin_peers",
  "debug_traceBlockByNumber",
  "debug_traceTransaction",
  "engine_forkchoiceUpdatedV1",
  "engine_newPayloadV1",
  "miner_start",
  "personal_unlockAccount",
  "txpool_content"
]);

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: unknown[];
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("request too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function proxyJsonRpc(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const ip = request.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    response.writeHead(429, { "content-type": "application/json" });
    response.end(JSON.stringify(jsonRpcError(null, -32029, "rate limit exceeded")));
    return;
  }

  const rawBody = await readBody(request);
  const parsed = JSON.parse(rawBody) as JsonRpcRequest | JsonRpcRequest[];
  const requests = Array.isArray(parsed) ? parsed : [parsed];

  for (const item of requests) {
    if (item.method && blockedPublicMethods.has(item.method)) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify(jsonRpcError(item.id, -32601, "method not available on public RPC")));
      return;
    }
  }

  const upstream = await getHealthyUpstream();
  if (!upstream) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify(jsonRpcError(null, -32003, "no healthy upstream")));
    return;
  }

  const startedAt = Date.now();
  const upstreamResponse = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody
  });
  const text = await upstreamResponse.text();

  console.log(JSON.stringify({
    method: requests.map((item) => item.method).join(","),
    upstream,
    status: upstreamResponse.status,
    latencyMs: Date.now() - startedAt
  }));

  response.writeHead(upstreamResponse.status, { "content-type": "application/json" });
  response.end(text);
}
