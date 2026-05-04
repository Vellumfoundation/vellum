import { readFileSync } from "node:fs";
import { join } from "node:path";

const superbridgeDir = process.env.SUPERBRIDGE_DIR || "bridge/superbridge";

type Token = {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  extensions?: Record<string, unknown>;
};

type TokenList = {
  name: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  tokens: Token[];
};

const list = JSON.parse(readFileSync(join(superbridgeDir, "token-list.json"), "utf8")) as TokenList;

if (!list.name || !list.timestamp || !list.version || !Array.isArray(list.tokens)) {
  throw new Error("Token list is missing required top-level fields.");
}

const nativeEth = list.tokens.filter((token) => token.symbol === "ETH" && token.extensions?.native === true);
if (nativeEth.length < 2) {
  throw new Error("Token list must include native ETH entries for Base and L3.");
}

for (const token of list.tokens) {
  if (!Number.isInteger(token.chainId)) throw new Error(`Invalid chain ID for ${token.symbol}`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(token.address)) throw new Error(`Invalid token address for ${token.symbol}`);
  if (!token.name || !token.symbol) throw new Error("Token name and symbol are required.");
  if (token.decimals !== 18 && token.extensions?.native === true) {
    throw new Error("Native ETH token entries must have 18 decimals.");
  }
}

console.log("Superbridge token list passed validation.");
