import { readFileSync } from "node:fs";

const env = process.env.PROJECT_ENV === "production" ? "mainnet" : process.env.PROJECT_ENV ?? "devnet";
const configPath = `chain/configs/${env}/chain.json`;
const chainConfig = JSON.parse(readFileSync(configPath, "utf8")) as {
  chainId: number;
  nativeCurrency: { symbol: string; decimals: number };
  parentChain: { chainId: number };
};

if (chainConfig.nativeCurrency.symbol !== "ETH") {
  throw new Error("Native currency must be ETH.");
}

if (env === "mainnet" && chainConfig.parentChain.chainId !== 8453) {
  throw new Error("Mainnet parent chain must be Base chain ID 8453.");
}

if (chainConfig.chainId === 0) {
  throw new Error(`Chain ID is not finalized for ${env}.`);
}

console.log(`${configPath} passed basic chain checks.`);
