import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const rpcUrl = process.env.VELLUM_RPC_URL || "http://127.0.0.1:8545";
export const wsRpcUrl = process.env.VELLUM_WS_URL || process.env.VELLUM_WS_RPC_URL || "ws://127.0.0.1:8546";
export const l1RpcUrl = process.env.DEVNET_L1_RPC_URL || "http://127.0.0.1:9545";
export const rollupRpcUrl = process.env.DEVNET_ROLLUP_RPC_URL || "http://127.0.0.1:8547";
export const liveRequired = process.env.VELLUM_E2E_REQUIRED === "true";
export const fundedDevnetPrivateKeys = {
  account2: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  account3: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  account4: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  account5: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  account6: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  account7: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
} as const satisfies Record<string, Hex>;
export const devnetPrivateKey = (process.env.DEVNET_PRIVATE_KEY ||
  fundedDevnetPrivateKeys.account2) as Hex;

export async function hasLiveRpc(url = rpcUrl): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(1500)
    });
    const body = await response.json() as { result?: string };
    return response.ok && typeof body.result === "string";
  } catch {
    return false;
  }
}

export async function requireLiveRpc(url = rpcUrl): Promise<void> {
  if (await hasLiveRpc(url)) return;
  if (liveRequired) {
    throw new Error(`Live RPC is required but unavailable at ${url}`);
  }
}

export function devnetRolePrivateKey(role: string): Hex {
  const envName = `DEVNET_${role.toUpperCase()}_PRIVATE_KEY`;
  const configured = process.env[envName];
  if (configured) return ensureHexPrivateKey(configured);

  const privateKey = readFileSync(`chain/devnet/deployer/addresses/${role}_private_key.txt`, "utf8").trim();
  return ensureHexPrivateKey(privateKey);
}

export function clients(privateKey: Hex = devnetPrivateKey, url = rpcUrl) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    publicClient: createPublicClient({ transport: http(url) }),
    walletClient: createWalletClient({ account, transport: http(url) })
  };
}

function ensureHexPrivateKey(privateKey: string): Hex {
  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
}
