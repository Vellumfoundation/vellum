import { execFileSync } from "node:child_process";
import { sha256File } from "./lib/common";

execFileSync("pnpm", ["validate:config"], { stdio: "inherit" });

const manifest = {
  gitCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
  generatedAt: new Date().toISOString(),
  hashes: {
    chainConfig: sha256File("chain/configs/mainnet/chain.json"),
    rollupConfig: sha256File("chain/configs/mainnet/rollup.json"),
    bridgeMetadata: sha256File("bridge/superbridge/chain-metadata.json"),
    tokenList: sha256File("bridge/superbridge/token-list.json")
  }
};

console.log(JSON.stringify(manifest, null, 2));
