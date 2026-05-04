import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, type Abi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildProveWithdrawal, finalizeWithdrawal, getWithdrawals, proveWithdrawal } from "viem/op-stack";
import {
  advanceAnvilTime,
  devnetBridgeAddresses,
  disputeGameAddress,
  disputeGameResolutionAbi,
  erc20Abi,
  getOrCreateNextDisputeGame,
  optimismMintableErc20FactoryAbi,
  optimismMintableErc20FactoryAddress,
  portalFinalizationAbi,
  standardBridgeAbi,
  waitForTokenBalanceAtLeast
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

describe("Bridge ERC20", () => {
  it("deposits and withdraws a canonical ERC20 through the standard bridge", async (t) => {
    if (!liveRequired && (!(await hasLiveRpc(l1RpcUrl)) || !(await hasLiveRpc(rpcUrl)))) {
      t.skip("live devnet L1/L3 RPC not available");
      return;
    }

    await requireLiveRpc(l1RpcUrl);
    await requireLiveRpc(rpcUrl);

    const bridgerKey = (process.env.DEVNET_BRIDGE_ERC20_PRIVATE_KEY ||
      fundedDevnetPrivateKeys.account6) as `0x${string}`;
    const recipient = privateKeyToAccount(bridgerKey).address;
    const addresses = devnetBridgeAddresses();
    const { account, publicClient: l1PublicClient, walletClient: l1WalletClient } = clients(bridgerKey, l1RpcUrl);
    const { publicClient: l3PublicClient, walletClient: l3WalletClient } = clients(bridgerKey, rpcUrl);
    const { account: proposerAccount, walletClient: proposerWalletClient } = clients(devnetRolePrivateKey("proposer"), l1RpcUrl);
    const tokenArtifact = JSON.parse(readFileSync("contracts/out/TestERC20.sol/TestERC20.json", "utf8")) as {
      abi: Abi;
      bytecode: { object: `0x${string}` };
    };
    const depositAmount = parseUnits("12", 18);
    const withdrawAmount = parseUnits("5", 18);

    const deployHash = await l1WalletClient.deployContract({
      abi: tokenArtifact.abi,
      bytecode: tokenArtifact.bytecode.object,
      chain: null,
      args: ["Dev Bridge Token", "DBT", 18]
    });
    const deployReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: deployHash });
    assert.equal(deployReceipt.status, "success");
    assert.ok(deployReceipt.contractAddress, "L1 ERC20 deployment should produce a contract address");
    const l1Token = deployReceipt.contractAddress;

    const l2Token = await l3PublicClient.simulateContract({
      account,
      address: optimismMintableErc20FactoryAddress,
      abi: optimismMintableErc20FactoryAbi,
      functionName: "createOptimismMintableERC20",
      args: [l1Token, "Dev Bridge Token", "DBT"]
    }).then((simulation) => simulation.result as Address);
    const createL2TokenHash = await l3WalletClient.writeContract({
      address: optimismMintableErc20FactoryAddress,
      abi: optimismMintableErc20FactoryAbi,
      functionName: "createOptimismMintableERC20",
      args: [l1Token, "Dev Bridge Token", "DBT"],
      chain: null
    });
    const createL2TokenReceipt = await l3PublicClient.waitForTransactionReceipt({ hash: createL2TokenHash });
    assert.equal(createL2TokenReceipt.status, "success");

    const mintHash = await l1WalletClient.writeContract({
      address: l1Token,
      abi: erc20Abi,
      functionName: "mint",
      args: [account.address, depositAmount],
      chain: null
    });
    assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: mintHash })).status, "success");

    const approveHash = await l1WalletClient.writeContract({
      address: l1Token,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.parentChain.standardBridge, depositAmount],
      chain: null
    });
    assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: approveHash })).status, "success");

    const l2BeforeDeposit = await l3PublicClient.readContract({
      address: l2Token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient]
    });
    const depositHash = await l1WalletClient.writeContract({
      address: addresses.parentChain.standardBridge,
      abi: standardBridgeAbi,
      functionName: "bridgeERC20To",
      args: [l1Token, l2Token, recipient, depositAmount, 250_000, "0x"],
      chain: null
    });
    const depositReceipt = await l1PublicClient.waitForTransactionReceipt({ hash: depositHash });
    assert.equal(depositReceipt.status, "success");
    await waitForTokenBalanceAtLeast(l3PublicClient, l2Token, recipient, l2BeforeDeposit + depositAmount);

    const l1BeforeWithdrawal = await l1PublicClient.readContract({
      address: l1Token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient]
    });
    const withdrawHash = await l3WalletClient.writeContract({
      address: addresses.l3.standardBridge,
      abi: standardBridgeAbi,
      functionName: "bridgeERC20To",
      args: [l2Token, l1Token, recipient, withdrawAmount, 250_000, "0x"],
      chain: null
    });
    const withdrawalReceipt = await l3PublicClient.waitForTransactionReceipt({ hash: withdrawHash });
    assert.equal(withdrawalReceipt.status, "success");

    const [withdrawal] = getWithdrawals(withdrawalReceipt);
    assert.ok(withdrawal, "ERC20 withdrawal receipt should include a MessagePassed log");

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
    assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: proveHash })).status, "success");

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
      assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: resolveClaimHash })).status, "success");

      const resolveHash = await l1WalletClient.writeContract({
        address: gameAddress,
        abi: disputeGameResolutionAbi,
        functionName: "resolve",
        chain: null
      });
      assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: resolveHash })).status, "success");
    }
    await advanceAnvilTime(l1RpcUrl, Number(gameDelay + 30n));

    const finalizeHash = await finalizeWithdrawal(l1WalletClient, {
      account,
      chain: null,
      portalAddress: addresses.parentChain.portal,
      withdrawal
    });
    assert.equal((await l1PublicClient.waitForTransactionReceipt({ hash: finalizeHash })).status, "success");

    const l1AfterWithdrawal = await l1PublicClient.readContract({
      address: l1Token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient]
    });
    const finalized = await l1PublicClient.readContract({
      address: addresses.parentChain.portal,
      abi: portalFinalizationAbi,
      functionName: "finalizedWithdrawals",
      args: [withdrawal.withdrawalHash]
    });

    assert.equal(l1AfterWithdrawal - l1BeforeWithdrawal, withdrawAmount);
    assert.equal(finalized, true);
  });
});
