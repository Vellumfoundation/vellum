import { readFileSync } from "node:fs";
import { join } from "node:path";

const production = process.env.PROJECT_ENV === "production";
const testnet = process.env.PROJECT_ENV === "testnet";
const expectedParentChainId = testnet ? 84532 : 8453;
const superbridgeDir = process.env.SUPERBRIDGE_DIR || "bridge/superbridge";
const zeroAddress = "0x0000000000000000000000000000000000000000";

type BridgeAddresses = {
  parentChain: { name: string; chainId: number; contracts: Record<string, string> };
  l3: { name: string; chainId: number; contracts: Record<string, string> };
};

const addresses = JSON.parse(readFileSync(join(superbridgeDir, "bridge-addresses.json"), "utf8")) as BridgeAddresses;

function mayBeZero(scope: string, name: string, contracts: Record<string, string>): boolean {
  return scope === "parentChain" &&
    name === "l2OutputOracle" &&
    contracts.disputeGameFactory !== undefined &&
    contracts.disputeGameFactory !== zeroAddress;
}

if (addresses.parentChain.chainId !== expectedParentChainId) {
  throw new Error(`Bridge parent chain must be ${testnet ? "Base Sepolia" : "Base mainnet"} chain ID ${expectedParentChainId}.`);
}

if (!Number.isInteger(addresses.l3.chainId) || addresses.l3.chainId <= 0) {
  throw new Error("L3 chain ID must be non-zero.");
}

for (const [scope, contracts] of [
  ["parentChain", addresses.parentChain.contracts],
  ["l3", addresses.l3.contracts]
] as const) {
  for (const [name, address] of Object.entries(contracts)) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`${scope}.${name} is not a valid EVM address.`);
    }
    if ((production || testnet) && address === zeroAddress && !mayBeZero(scope, name, contracts)) {
      throw new Error(`${scope}.${name} must not be zero in ${testnet ? "testnet" : "production"}.`);
    }
  }
}

console.log("Superbridge bridge addresses passed validation.");
