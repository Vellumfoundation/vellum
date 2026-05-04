import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("Superbridge metadata", () => {
  it("uses ETH as native gas and Base as parent", () => {
    const metadata = JSON.parse(readFileSync("bridge/superbridge/chain-metadata.json", "utf8")) as {
      parentChainId: number;
      nativeCurrency: { symbol: string };
    };

    assert.equal(metadata.parentChainId, 8453);
    assert.equal(metadata.nativeCurrency.symbol, "ETH");
  });
});
