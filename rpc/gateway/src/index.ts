import { createServer } from "node:http";
import { URL } from "node:url";
import { handleHealth, handleMetrics, handleReady } from "./health";
import { proxyJsonRpc } from "./proxy";

const port = Number(process.env.RPC_GATEWAY_PORT || "8080");

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      handleHealth(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      await handleReady(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/metrics") {
      handleMetrics(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/") {
      await proxyJsonRpc(request, response);
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "internal_error" }));
    console.error(error);
  }
});

server.listen(port, () => {
  console.log(`Vellum RPC gateway listening on :${port}`);
});
