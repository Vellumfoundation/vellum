import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const files = [
  "bridge/superbridge/chain-metadata.json",
  "bridge/superbridge/bridge-addresses.json",
  "bridge/superbridge/token-list.json",
  "bridge/superbridge/integration-notes.md"
];

for (const file of files) {
  const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
  console.log(`${file}: ${digest}`);
}

console.log("Superbridge package hashes generated.");
