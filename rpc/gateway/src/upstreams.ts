const upstreams = (process.env.RPC_UPSTREAMS || process.env.VELLUM_RPC_URL || "http://localhost:8545")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const expectedChainId = process.env.RPC_EXPECTED_CHAIN_ID?.toLowerCase();
const maxBlockLag = BigInt(Math.max(0, Number(process.env.RPC_MAX_BLOCK_LAG || "5")));
const healthTimeoutMs = Number(process.env.RPC_HEALTH_TIMEOUT_MS || "1500");

type UpstreamStatus = {
  url: string;
  chainId: string;
  blockNumber: bigint;
};

export async function getHealthyUpstream(): Promise<string | undefined> {
  const statuses = (await Promise.all(upstreams.map((upstream) => getUpstreamStatus(upstream))))
    .filter((status): status is UpstreamStatus => Boolean(status));
  const matchingChain = expectedChainId
    ? statuses.filter((status) => status.chainId.toLowerCase() === expectedChainId)
    : statuses;

  if (matchingChain.length === 0) return undefined;

  const highestBlock = matchingChain.reduce(
    (highest, status) => status.blockNumber > highest ? status.blockNumber : highest,
    0n
  );
  const minimumBlock = highestBlock > maxBlockLag ? highestBlock - maxBlockLag : 0n;
  return matchingChain.find((status) => status.blockNumber >= minimumBlock)?.url;
}

export function listUpstreams(): string[] {
  return upstreams;
}

async function getUpstreamStatus(url: string): Promise<UpstreamStatus | undefined> {
  try {
    const [chainId, blockNumber] = await Promise.all([
      requestJsonRpc<string>(url, "eth_chainId"),
      requestJsonRpc<string>(url, "eth_blockNumber")
    ]);
    if (!chainId || !blockNumber || !/^0x[0-9a-fA-F]+$/.test(blockNumber)) return undefined;

    return { url, chainId, blockNumber: BigInt(blockNumber) };
  } catch {
    return undefined;
  }
}

async function requestJsonRpc<T>(url: string, method: string): Promise<T | undefined> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    signal: AbortSignal.timeout(healthTimeoutMs)
  });
  const body = await response.json() as { result?: T };
  if (!response.ok) return undefined;
  return body.result;
}
