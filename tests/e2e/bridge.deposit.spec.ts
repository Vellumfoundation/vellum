import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { devnetBridgeAddresses, standardBridgeAbi, waitForBalanceAtLeast } from "./lib/bridge";
import { clients, fundedDevnetPrivateKeys, hasLiveRpc, l1RpcUrl, liveRequired, requireLiveRpc, rpcUrl } from "./lib/live";

describe("Bridge deposit", () => {
  it("bridges ETH from parent to L3 through the standard bridge", async (t) => {
    if (!liveRequired && (!(await hasLiveRpc(l1RpcUrl)) || !(await hasLiveRpc(rpcUrl)))) {
      t.skip("live devnet L1/L3 RPC not available");
      return;
    }

    await requireLiveRpc(l1RpcUrl);
    await requireLiveRpc(rpcUrl);

    const depositorKey = (process.env.DEVNET_BRIDGE_DEPOSIT_PRIVATE_KEY ||
      fundedDevnetPrivateKeys.account3) as `0x${string}`;
    const recipient = privateKeyToAccount(
      (process.env.DEVNET_BRIDGE_DEPOSIT_RECIPIENT_PRIVATE_KEY ||
        fundedDevnetPrivateKeys.account6) as `0x${string}`
    ).address;
    const addresses = devnetBridgeAddresses();
    const { publicClient: l1PublicClient, walletClient: l1WalletClient } = clients(depositorKey, l1RpcUrl);
    const { publicClient: l3PublicClient } = clients(depositorKey, rpcUrl);
    const value = parseEther("0.0002");

    const before = await l3PublicClient.getBalance({ address: recipient });
    const hash = await l1WalletClient.writeContract({
      address: addresses.parentChain.standardBridge,
      abi: standardBridgeAbi,
      functionName: "bridgeETHTo",
      args: [recipient, 200_000, "0x"],
      chain: null,
      value
    });
    const receipt = await l1PublicClient.waitForTransactionReceipt({ hash });
    const after = await waitForBalanceAtLeast(l3PublicClient, recipient, before + value);

    assert.equal(receipt.status, "success");
    assert.ok(after >= before + value);
  });
});
