import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clients, hasLiveRpc, liveRequired, requireLiveRpc } from "./lib/live";

describe("L3 contract deployment", () => {
  it("deploys TestERC20 and reads token metadata", async (t) => {
    if (!liveRequired && !(await hasLiveRpc())) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc();

    const artifact = JSON.parse(readFileSync("contracts/out/TestERC20.sol/TestERC20.json", "utf8")) as {
      abi: unknown[];
      bytecode: { object: `0x${string}` };
    };
    const { publicClient, walletClient } = clients();
    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      chain: null,
      args: ["Dev Token", "DEV", 18]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    assert.equal(receipt.status, "success");
    assert.ok(receipt.contractAddress);

    const symbol = await publicClient.readContract({
      address: receipt.contractAddress,
      abi: artifact.abi,
      functionName: "symbol"
    });

    assert.equal(symbol, "DEV");
  });
});
