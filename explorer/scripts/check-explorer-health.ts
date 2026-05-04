const explorerUrl = (process.env.EXPLORER_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const rpcUrl = process.env.VELLUM_RPC_URL || "http://127.0.0.1:8545";

type IndexingStatus = {
  finished_indexing_blocks: boolean;
  indexed_blocks_ratio: string;
};

type VerificationConfig = {
  is_rust_verifier_microservice_enabled?: boolean;
  verification_options?: string[];
};

type RpcResponse<T> = {
  result?: T;
  error?: { message: string };
};

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body?: T; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) as T : undefined;
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function rpc<T>(method: string): Promise<T | undefined> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(5000)
    });
    const body = await response.json() as RpcResponse<T>;
    return body.result;
  } catch {
    return undefined;
  }
}

async function getText(
  url: string
): Promise<{ ok: boolean; status: number; contentType?: string; looksLikeBlockscout?: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(5000)
    });
    const text = await response.text();
    const looksLikeBlockscout = /blockscout|__next|vellum/i.test(text) && !/Welcome to nginx/i.test(text);
    return {
      ok: response.ok && looksLikeBlockscout,
      status: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      looksLikeBlockscout
    };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const [page, indexing, verification, rpcBlock] = await Promise.all([
    getText(`${explorerUrl}/`),
    getJson<IndexingStatus>(`${explorerUrl}/api/v2/main-page/indexing-status`),
    getJson<VerificationConfig>(`${explorerUrl}/api/v2/smart-contracts/verification/config`),
    rpc<string>("eth_blockNumber")
  ]);

  const health = {
    explorerUrl,
    rpcUrl,
    ok: page.ok && indexing.ok && verification.ok,
    page: {
      ok: page.ok,
      status: page.status,
      contentType: page.contentType,
      looksLikeBlockscout: page.looksLikeBlockscout,
      error: page.error
    },
    indexing: {
      ok: indexing.ok,
      status: indexing.status,
      finishedBlocks: indexing.body?.finished_indexing_blocks,
      indexedBlocksRatio: indexing.body?.indexed_blocks_ratio,
      error: indexing.error
    },
    verification: {
      ok: verification.ok,
      status: verification.status,
      enabled: verification.body?.is_rust_verifier_microservice_enabled,
      options: verification.body?.verification_options,
      error: verification.error
    },
    chain: {
      latestBlock: rpcBlock ? Number(BigInt(rpcBlock)) : undefined
    }
  };

  console.log(JSON.stringify(health, null, 2));

  if (!health.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
