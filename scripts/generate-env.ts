import { readJson } from "./lib/common";

type ProjectConfig = {
  project: { name: string; slug: string };
  chain: { chainId: number; chainIdHex: string };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  parentChain: { name: string; chainId: number };
};

const config = readJson<ProjectConfig>("config/project.json");

console.log(`VELLUM_NAME="${config.project.name}"`);
console.log(`VELLUM_CHAIN_ID=${config.chain.chainId}`);
console.log(`VELLUM_CHAIN_ID_HEX=${config.chain.chainIdHex}`);
console.log(`VELLUM_CHAIN_SLUG=${config.project.slug}`);
console.log(`PARENT_CHAIN_NAME=${config.parentChain.name}`);
console.log(`PARENT_CHAIN_ID=${config.parentChain.chainId}`);
console.log(`NATIVE_CURRENCY_NAME=${config.nativeCurrency.name}`);
console.log(`NATIVE_CURRENCY_SYMBOL=${config.nativeCurrency.symbol}`);
console.log(`NATIVE_CURRENCY_DECIMALS=${config.nativeCurrency.decimals}`);
