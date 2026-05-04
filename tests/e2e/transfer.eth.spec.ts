import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { clients, fundedDevnetPrivateKeys, hasLiveRpc, liveRequired, requireLiveRpc } from "./lib/live";

describe("L3 ETH transfer", () => {
  it("funds account A, sends ETH to B, confirms receipt and balances", async (t) => {
    if (!liveRequired && !(await hasLiveRpc())) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc();

    const { publicClient, walletClient } = clients(fundedDevnetPrivateKeys.account4);
    const recipient = "0x000000000000000000000000000000000000bEEF";
    const value = parseEther("0.000001");

    const before = await publicClient.getBalance({ address: recipient });
    const hash = await walletClient.sendTransaction({ chain: null, to: recipient, value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.getBalance({ address: recipient });

    assert.equal(receipt.status, "success");
    assert.equal(after - before, value);
  });
});
