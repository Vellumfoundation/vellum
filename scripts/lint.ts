import { walkFiles } from "./lib/common";
import { readFileSync } from "node:fs";

const jsonFiles = walkFiles(".", (path) => path.endsWith(".json"));
const shellFiles = walkFiles("chain/scripts", (path) => path.endsWith(".sh"));

for (const file of jsonFiles) {
  JSON.parse(readFileSync(file, "utf8"));
}

for (const file of shellFiles) {
  const content = readFileSync(file, "utf8");
  if (!content.includes("set -euo pipefail")) {
    throw new Error(`${file} must use set -euo pipefail.`);
  }
}

console.log(`Lint checks passed for ${jsonFiles.length} JSON files and ${shellFiles.length} shell files.`);
