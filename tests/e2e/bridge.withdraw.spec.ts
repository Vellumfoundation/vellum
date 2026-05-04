import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildProveWithdrawal, finalizeWithdrawal, getWithdrawals, proveWithdrawal } from "viem/op-stack";
import {
  advanceAnvilTime,
  devnetBridgeAddresses,
  disputeGameAddress,
  disputeGameResolutionAbi,
  getOrCreateNextDisputeGame,
  portalFinalizationAbi,
  standardBridgeAbi
} from "./lib/bridge";
import {
  clients,
  devnetRolePrivateKey,
  fundedDevnetPrivateKeys,
  hasLiveRpc,
  l1RpcUrl,
  liveRequired,
  requireLiveRpc,
  rollupRpcUrl,
  rpcUrl
} from "./lib/live";

describe("Bridge withdrawal", () => {
  it("initiates an ETH withdrawal from L3 through the standard bridge", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet L3 RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);

    const withdrawerKey = (process.env.DEVNET_BRIDGE_WITHDRAW_PRIVATE_KEY ||
      fundedDevnetPrivateKeys.account5) as `0x${string}`;
    const recipient = privateKeyToAccount(withdrawerKey).address;
    const addresses = devnetBridgeAddresses();
    const { account, publicClient, walletClient } = clients(withdrawerKey, rpcUrl);
    const value = parseEther("0.0001");

    const before = await publicClient.getBalance({ address: account.address });
    const hash = await walletClient.writeContract({
      address: addresses.l3.standardBridge,
      abi: standardBridgeAbi,
      functionName: "bridgeETHTo",
      args: [recipient, 200_000, "0x"],
      chain: null,
      value
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const after = await publicClient.getBalance({ address: account.address });

    assert.equal(receipt.status, "success");
    assert.ok(after < before - value, "withdrawal should spend bridged ETH plus transaction gas");
  });

  it("proves and finalizes an ETH withdrawal on the parent chain", async (t) => {
    if (!liveRequired && (!(await hasLiveRpc(l1RpcUrl)) || !(await hasLiveRpc(rpcUrl)))) {
      t.skip("live devnet L1/L3 RPC not available");
      return;
    }

    await requireLiveRpc(l1RpcUrl);
    await requireLiveRpc(rpcUrl);

    const withdrawerKey = (process.env.DEVNET_BRIDGE_FINALIZE_WITHDRAW_PRIVATE_KEY ||
      fundedDevnetPrivateKeys.account7) as `0x${string}`;
    const recipient = privateKeyToAccount(withdrawerKey).address;
    const addresses = devnetBridgeAddresses();
    const { account, publicClient: l3PublicClient, walletClient: l3WalletClient } = clients(withdrawerKey, rpcUrl);
    const { publicClient: l1PublicClient, walletClient: l1WalletClient } = clients(withdrawerKey, l1RpcUrl);
    const { account: proposerAccount, walletClient: proposerWalletClient } = clients(devnetRolePrivateKey("proposer"), l1RpcUrl);
    const value = parseEther("0.0001");

    const withdrawalHash = await l3WalletClient.writeContract({
      address: addresses.l3.standardBridge,
      abi: standardBridgeAbi,
      functionName: "bridgeETHTo",
      args: [recipient, 200_000, "0x"],
      chain: null,
      value
    });
    const withdrawalReceipt = await l3PublicClient.waitForTransactionReceipt({ hash: withdrawalHash });
    assert.equal(withdrawalReceipt.status, "success");

    const [withdrawal] = getWithdrawals(withdrawalReceipt);
    assert.ok(withdrawal, "withdrawal receipt should include a MessagePassed log");

    const game = await getOrCreateNextDisputeGame(
      l1PublicClient,
      proposerWalletClient,
      proposerAccount,
      addresses,
      rollupRpcUrl,
      withdrawalReceipt.blockNumber
    );
    const proveArgs = await buildProveWithdrawal(l3PublicClient, { chain: null, game, withdrawal });
    const proveHash = await proveWithdrawal(l1WalletClient, {
      account,
      chain: null,
      l2OutputIndex: proveArgs.l2OutputIndex,
      outputRootProof: proveArgs.outputRootProof,
      portalAddress: addresses.parentChain.portal,
      withdrawal: proveArgs.withdrawal,
      withdrawalProof: proveArgs.withdrawalProof
    });
    const proveReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: proveHash });
    assert.equal(proveReceipt.status, "success");

    const [proofDelay, gameDelay] = await Promise.all([
      l1PublicClient.readContract({
        address: addresses.parentChain.portal,
        abi: portalFinalizationAbi,
        functionName: "proofMaturityDelaySeconds"
      }),
      l1PublicClient.readContract({
        address: addresses.parentChain.portal,
        abi: portalFinalizationAbi,
        functionName: "disputeGameFinalityDelaySeconds"
      })
    ]);
    await advanceAnvilTime(l1RpcUrl, Number(proofDelay + 30n));

    const gameAddress = disputeGameAddress(game.metadata);
    const gameStatus = await l1PublicClient.readContract({
      address: gameAddress,
      abi: disputeGameResolutionAbi,
      functionName: "status"
    });
    if (gameStatus === 0) {
      const resolveClaimHash = await l1WalletClient.writeContract({
        address: gameAddress,
        abi: disputeGameResolutionAbi,
        functionName: "resolveClaim",
        args: [0n, 0n],
        chain: null
      });
      const resolveClaimReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: resolveClaimHash });
      assert.equal(resolveClaimReceipt.status, "success");

      const resolveHash = await l1WalletClient.writeContract({
        address: gameAddress,
        abi: disputeGameResolutionAbi,
        functionName: "resolve",
        chain: null
      });
      const resolveReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: resolveHash });
      assert.equal(resolveReceipt.status, "success");
    }
    await advanceAnvilTime(l1RpcUrl, Number(gameDelay + 30n));

    const finalizeHash = await finalizeWithdrawal(l1WalletClient, {
      account,
      chain: null,
      portalAddress: addresses.parentChain.portal,
      withdrawal
    });
    const finalizeReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: finalizeHash });
    const finalized = await l1PublicClient.readContract({
      address: addresses.parentChain.portal,
      abi: portalFinalizationAbi,
      functionName: "finalizedWithdrawals",
      args: [withdrawal.withdrawalHash]
    });

    assert.equal(finalizeReceipt.status, "success");
    assert.equal(finalized, true);
  });
});
