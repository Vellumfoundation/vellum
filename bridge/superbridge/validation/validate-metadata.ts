import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const superbridgeDir = process.env.SUPERBRIDGE_DIR || "bridge/superbridge";
const metadataPath = join(root, superbridgeDir, "chain-metadata.json");
const production = process.env.PROJECT_ENV === "production";
const testnet = process.env.PROJECT_ENV === "testnet";
const expectedParentChainId = testnet ? 84532 : 8453;
const zeroAddress = "0x0000000000000000000000000000000000000000";

type Metadata = {
  name: string;
  slug: string;
  chainId: number;
  parentChainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { public?: string; websocket?: string };
  explorers: Array<{ url?: string }>;
  bridge: Record<string, unknown>;
  brand?: { icon?: string; logo?: string };
};

function fail(message: string): never {
  throw new Error(`Superbridge metadata invalid: ${message}`);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

if (!existsSync(metadataPath)) {
  fail(`missing ${metadataPath}`);
}

const metadata = readJson<Metadata>(metadataPath);

if (!metadata.name) fail("name is required");
if (!metadata.slug) fail("slug is required");
if (!Number.isInteger(metadata.chainId) || metadata.chainId <= 0) fail("chainId must be non-zero");
if (metadata.parentChainId !== expectedParentChainId) {
  fail(`parentChainId must be ${testnet ? "Base Sepolia" : "Base mainnet"} chain ID ${expectedParentChainId}`);
}
if (metadata.nativeCurrency.name !== "Ether") fail("native currency name must be Ether");
if (metadata.nativeCurrency.symbol !== "ETH") fail("native currency symbol must be ETH");
if (metadata.nativeCurrency.decimals !== 18) fail("native currency decimals must be 18");
if (!metadata.rpcUrls.public) fail("public RPC URL is required");
if (!metadata.rpcUrls.websocket) fail("WebSocket RPC URL is required");
if (!metadata.explorers?.[0]?.url) fail("explorer URL is required");
if (metadata.bridge.type !== "op-stack-canonical") fail("bridge type must be op-stack-canonical");

const bridgeAddressKeys = [
  "parentChainPortalAddress",
  "parentChainStandardBridgeAddress",
  "parentChainCrossDomainMessengerAddress",
  "l3StandardBridgeAddress",
  "l3CrossDomainMessengerAddress"
];

for (const key of bridgeAddressKeys) {
  const value = metadata.bridge[key];
  if (!isAddress(value)) fail(`${key} must be an EVM address`);
  if ((production || testnet) && value === zeroAddress) fail(`${key} must not be zero in ${testnet ? "testnet" : "production"}`);
}

if (production && metadata.bridge.withdrawalChallengePeriodSeconds === 0) {
  fail("withdrawalChallengePeriodSeconds must be finalized in production");
}

if (!metadata.brand?.icon || !metadata.brand.logo) {
  fail("brand icon and logo URLs are required");
}

console.log("Superbridge chain metadata passed validation.");
