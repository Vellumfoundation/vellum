import { readFileSync } from "node:fs";

const addresses = JSON.parse(readFileSync("bridge/superbridge/bridge-addresses.json", "utf8")) as {
  parentChain: { contracts: Record<string, string> };
  l3: { contracts: Record<string, string> };
};

console.log("Bridge contracts to verify:");
console.log(JSON.stringify(addresses, null, 2));
console.log("Phase 3 will add live bytecode, ABI, and ownership checks.");
