import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { encodeAbiParameters, numberToHex } from "viem";
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";

export const standardBridgeAbi = [
  {
    type: "function",
    name: "bridgeERC20To",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_localToken", type: "address" },
      { name: "_remoteToken", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "bridgeETHTo",
    stateMutability: "payable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" }
    ],
    outputs: []
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export const optimismMintableErc20FactoryAbi = [
  {
    type: "function",
    name: "createOptimismMintableERC20",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_remoteToken", type: "address" },
      { name: "_name", type: "string" },
      { name: "_symbol", type: "string" }
    ],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

export const optimismMintableErc20FactoryAddress: Address = "0x4200000000000000000000000000000000000012";

export const portalFinalizationAbi = [
  {
    type: "function",
    name: "disputeGameFinalityDelaySeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "finalizedWithdrawals",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "proofMaturityDelaySeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export const disputeGameResolutionAbi = [
  {
    type: "function",
    name: "l2SequenceNumber",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "l2SequenceNumber_", type: "uint256" }]
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "status_", type: "uint8" }]
  },
  {
    type: "function",
    name: "resolveClaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_claimIndex", type: "uint256" },
      { name: "_numToResolve", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "status_", type: "uint8" }]
  }
] as const;

export const disputeGameFactoryReadAbi = [
  {
    type: "function",
    name: "findLatestGames",
    stateMutability: "view",
    inputs: [
      { name: "_gameType", type: "uint32" },
      { name: "_start", type: "uint256" },
      { name: "_n", type: "uint256" }
    ],
    outputs: [
      {
        name: "games_",
        type: "tuple[]",
        components: [
          { name: "index", type: "uint256" },
          { name: "metadata", type: "bytes32" },
          { name: "timestamp", type: "uint64" },
          { name: "rootClaim", type: "bytes32" },
          { name: "extraData", type: "bytes" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "gameCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "gameCount_", type: "uint256" }]
  },
  {
    type: "function",
    name: "initBonds",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint32" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "create",
    stateMutability: "payable",
    inputs: [
      { name: "_gameType", type: "uint32" },
      { name: "_rootClaim", type: "bytes32" },
      { name: "_extraData", type: "bytes" }
    ],
    outputs: [{ name: "proxy_", type: "address" }]
  }
] as const;

export const portalGameAbi = [
  {
    type: "function",
    name: "respectedGameType",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }]
  }
] as const;

type DevnetBridgeAddresses = {
  parentChain: {
    portal: Address;
    standardBridge: Address;
    crossDomainMessenger: Address;
    systemConfig: Address;
    l2OutputOracle: Address;
    disputeGameFactory: Address;
  };
  l3: {
    standardBridge: Address;
    crossDomainMessenger: Address;
    weth: Address;
    multicall3: Address;
  };
};

type DisputeGameRecord = {
  index: bigint;
  metadata: Hex;
  timestamp: bigint;
  rootClaim: Hex;
  extraData: Hex;
};

export type DevnetDisputeGame = DisputeGameRecord & {
  l2BlockNumber: bigint;
};

const zeroAddress = "0x0000000000000000000000000000000000000000";

export function devnetBridgeAddresses(): DevnetBridgeAddresses {
  const addresses = JSON.parse(readFileSync("chain/configs/devnet/addresses.json", "utf8")) as DevnetBridgeAddresses;

  assert.notEqual(addresses.parentChain.standardBridge, zeroAddress, "missing L1 standard bridge address");
  assert.notEqual(addresses.parentChain.portal, zeroAddress, "missing L1 portal address");
  assert.notEqual(addresses.l3.standardBridge, zeroAddress, "missing L3 standard bridge address");
  assert.notEqual(addresses.l3.weth, zeroAddress, "missing L3 WETH address");

  return addresses;
}

export async function waitForBalanceAtLeast(
  publicClient: PublicClient,
  address: Address,
  target: bigint,
  timeoutMs = 120_000
): Promise<bigint> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const balance = await publicClient.getBalance({ address });
    if (balance >= target) {
      return balance;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const balance = await publicClient.getBalance({ address });
  assert.ok(balance >= target, `timed out waiting for ${address} balance ${balance} to reach ${target}`);
  return balance;
}

export async function waitForTokenBalanceAtLeast(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  target: bigint,
  timeoutMs = 120_000
): Promise<bigint> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const balance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner]
    });
    if (balance >= target) {
      return balance;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const balance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner]
  });
  assert.ok(balance >= target, `timed out waiting for ${owner} token balance ${balance} to reach ${target}`);
  return balance;
}

export async function waitForNextDisputeGame(
  publicClient: PublicClient,
  addresses: DevnetBridgeAddresses,
  l2BlockNumber: bigint,
  timeoutMs = 120_000
): Promise<DevnetDisputeGame> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const game = await getNextDisputeGame(publicClient, addresses, l2BlockNumber);
    if (game) return game;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  assert.fail(`timed out waiting for a dispute game after L2 block ${l2BlockNumber}`);
}

export async function getOrCreateNextDisputeGame(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Account,
  addresses: DevnetBridgeAddresses,
  rollupRpcUrl: string,
  l2BlockNumber: bigint,
  waitTimeoutMs = 30_000
): Promise<DevnetDisputeGame> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < waitTimeoutMs) {
    const game = await getNextDisputeGame(publicClient, addresses, l2BlockNumber);
    if (game) return game;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return createDevnetDisputeGame(publicClient, walletClient, account, addresses, rollupRpcUrl, l2BlockNumber);
}

export function disputeGameAddress(metadata: Hex): Address {
  return `0x${metadata.slice(26)}`;
}

export async function advanceAnvilTime(rpcUrl: string, seconds: number): Promise<void> {
  await jsonRpc(rpcUrl, "evm_increaseTime", [seconds]);
  await jsonRpc(rpcUrl, "evm_mine", []);
}

async function jsonRpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const body = await response.json() as { error?: { message?: string }; result?: unknown };
  assert.equal(response.ok, true, `${method} RPC request failed`);
  assert.equal(body.error, undefined, body.error?.message);
  return body.result;
}

async function createDevnetDisputeGame(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Account,
  addresses: DevnetBridgeAddresses,
  rollupRpcUrl: string,
  l2BlockNumber: bigint
): Promise<DevnetDisputeGame> {
  const [gameType, outputRoot] = await Promise.all([
    publicClient.readContract({
      address: addresses.parentChain.portal,
      abi: portalGameAbi,
      functionName: "respectedGameType"
    }),
    outputRootAtBlock(rollupRpcUrl, l2BlockNumber)
  ]);
  const [bond, existingGame] = await Promise.all([
    publicClient.readContract({
      address: addresses.parentChain.disputeGameFactory,
      abi: disputeGameFactoryReadAbi,
      functionName: "initBonds",
      args: [gameType]
    }),
    getNextDisputeGame(publicClient, addresses, l2BlockNumber)
  ]);
  if (existingGame) return existingGame;

  const extraData = encodeAbiParameters([{ type: "uint256" }], [l2BlockNumber]);
  let hash: Hex;
  try {
    hash = await walletClient.writeContract({
      account,
      address: addresses.parentChain.disputeGameFactory,
      abi: disputeGameFactoryReadAbi,
      functionName: "create",
      args: [gameType, outputRoot, extraData],
      chain: null,
      value: bond
    });
  } catch (error) {
    const game = await getNextDisputeGame(publicClient, addresses, l2BlockNumber);
    if (game) return game;
    throw error;
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");

  const game = await getNextDisputeGame(publicClient, addresses, l2BlockNumber);
  assert.ok(game, `created dispute game should cover L2 block ${l2BlockNumber}`);
  return game;
}

async function outputRootAtBlock(rollupRpcUrl: string, l2BlockNumber: bigint): Promise<Hex> {
  const result = await jsonRpc(rollupRpcUrl, "optimism_outputAtBlock", [numberToHex(l2BlockNumber)]);
  assert.equal(typeof result, "object", "optimism_outputAtBlock should return an object");
  assert.notEqual(result, null, "optimism_outputAtBlock should return a result");

  const outputRoot = (result as { outputRoot?: unknown }).outputRoot;
  assert.equal(typeof outputRoot, "string", "optimism_outputAtBlock result should include outputRoot");
  const hexOutputRoot = outputRoot as string;
  assert.ok(hexOutputRoot.startsWith("0x"), "outputRoot should be hex");
  return hexOutputRoot as Hex;
}

async function getNextDisputeGame(
  publicClient: PublicClient,
  addresses: DevnetBridgeAddresses,
  l2BlockNumber: bigint
): Promise<DevnetDisputeGame | undefined> {
  const [gameCount, gameType] = await Promise.all([
    publicClient.readContract({
      address: addresses.parentChain.disputeGameFactory,
      abi: disputeGameFactoryReadAbi,
      functionName: "gameCount"
    }),
    publicClient.readContract({
      address: addresses.parentChain.portal,
      abi: portalGameAbi,
      functionName: "respectedGameType"
    })
  ]);

  if (gameCount === 0n) return undefined;

  const rawGames = await publicClient.readContract({
    address: addresses.parentChain.disputeGameFactory,
    abi: disputeGameFactoryReadAbi,
    functionName: "findLatestGames",
    args: [gameType, gameCount - 1n, BigInt(Math.min(Number(gameCount), 200))]
  }) as DisputeGameRecord[];

  for (const game of rawGames) {
    const gameL2BlockNumber = await publicClient.readContract({
      address: disputeGameAddress(game.metadata),
      abi: disputeGameResolutionAbi,
      functionName: "l2SequenceNumber"
    });
    if (gameL2BlockNumber >= l2BlockNumber) {
      return { ...game, l2BlockNumber: gameL2BlockNumber };
    }
  }

  return undefined;
}
