import type { ServerResponse } from "node:http";
import { getHealthyUpstream, listUpstreams } from "./upstreams";

export function handleHealth(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok" }));
}

export async function handleReady(response: ServerResponse): Promise<void> {
  const upstream = await getHealthyUpstream();
  const status = upstream ? 200 : 503;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ ready: Boolean(upstream), upstream }));
}

export function handleMetrics(response: ServerResponse): void {
  const body = [
    "# HELP vellum_rpc_gateway_up RPC gateway process health.",
    "# TYPE vellum_rpc_gateway_up gauge",
    "vellum_rpc_gateway_up 1",
    "# HELP vellum_rpc_gateway_upstreams_configured Configured upstream count.",
    "# TYPE vellum_rpc_gateway_upstreams_configured gauge",
    `vellum_rpc_gateway_upstreams_configured ${listUpstreams().length}`
  ].join("\n");

  response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
  response.end(`${body}\n`);
}
