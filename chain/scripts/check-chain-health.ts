type RpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

const rpcUrl = process.env.VELLUM_RPC_URL ?? "http://localhost:8545";

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const body = (await response.json()) as RpcResponse<T>;
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(body.error?.message ?? `RPC ${method} failed`);
  }
  return body.result;
}

const chainId = await rpc<string>("eth_chainId");
const blockNumber = await rpc<string>("eth_blockNumber");

console.log(JSON.stringify({ rpcUrl, chainId, blockNumber }, null, 2));
