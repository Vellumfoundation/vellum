import { readFileSync } from "node:fs";

import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseEther,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  buildProveWithdrawal,
  chainConfig,
  finalizeWithdrawal,
  getTimeToFinalize,
  getWithdrawalStatus,
  getWithdrawals,
  initiateWithdrawal,
  proveWithdrawal,
  waitToFinalize,
  waitToProve
} from "viem/op-stack";

type AddressConfig = {
  parentChain: {
    portal: string;
    standardBridge: string;
    crossDomainMessenger: string;
    disputeGameFactory: string;
  };
};

type ChainConfig = {
  chainId: number;
  chainIdHex: string;
  parentChain: { chainId: number };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { public: string; websocket: string };
  explorerUrl: string;
  blockTimeSeconds: number;
};

type SmokeResult = {
  chainId: number;
  parentChainId: number;
  l3RpcUrl: string;
  amountEth: string;
  account: string;
  withdrawalHash: string;
  initiateTxHash: string;
  initiateBlockNumber: string;
  proveTxHash?: string;
  gameAddress?: string;
  gameMaxClockDurationSeconds?: string;
  resolveClaimTxHash?: string;
  resolveGameTxHash?: string;
  gameStatusAfterResolve?: string;
  finalizeTxHash?: string;
  finalStatus: string;
  proofMaturitySeconds?: number;
  secondsToFinalize?: number;
  finalizationPending?: boolean;
  resumedFromInitiateTxHash?: string;
  l3BalanceBeforeEth: string;
  l3BalanceAfterEth: string;
  parentBalanceBeforeEth: string;
  parentBalanceAfterEth: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function requireAddress(name: string, value: string): `0x${string}` {
  if (!isAddress(value) || value === zeroAddress) {
    throw new Error(`${name} must be a deployed nonzero address.`);
  }
  return value as `0x${string}`;
}

const disputeGameResolverAbi = [
  {
    type: "function",
    name: "maxClockDuration",
    inputs: [],
    outputs: [{ type: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getChallengerDuration",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "resolvedSubgames",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "status",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "resolveClaim",
    inputs: [{ type: "uint256" }, { type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "resolve",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "nonpayable"
  }
] as const;

const disputeGameStatuses = ["in_progress", "challenger_wins", "defender_wins"] as const;

function disputeGameStatusName(status: number): string {
  return disputeGameStatuses[status] || `unknown_${status}`;
}

function disputeGameAddressFromMetadata(metadata: `0x${string}`): Address {
  return `0x${metadata.slice(26)}` as Address;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "shortMessage" in error) {
    return String((error as { shortMessage?: unknown }).shortMessage);
  }
  return String(error);
}

function isProofObservationLag(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes("Withdrawal has not been proven on L1");
}

async function waitForFinalizationTiming(
  publicClientL1: any,
  withdrawalHash: `0x${string}`,
  initiateReceipt: any,
  targetChain: any,
  maxWaitMs: number,
  pollingInterval: number
): Promise<{
  timeToFinalize: { period: number; seconds: number };
  status: string;
}> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt <= maxWaitMs) {
    try {
      const timeToFinalize = await getTimeToFinalize(publicClientL1, {
        chain: null,
        withdrawalHash,
        targetChain
      });
      const status = await getWithdrawalStatus(publicClientL1, {
        chain: null,
        receipt: initiateReceipt,
        targetChain
      });

      return { timeToFinalize, status };
    } catch (error) {
      lastError = error;
      if (!isProofObservationLag(error)) throw error;
      await sleep(pollingInterval);
    }
  }

  throw new Error(`Withdrawal proof was accepted but not observable after ${maxWaitMs}ms: ${errorMessage(lastError)}`);
}

function isGameAlreadyResolved(error: unknown): boolean {
  const message = errorMessage(error);
  return message.includes("0x67fe1950") || message.includes("GameNotInProgress");
}

async function resolveUncontestedDisputeGame(
  publicClientL1: any,
  walletClientL1: any,
  account: ReturnType<typeof privateKeyToAccount>,
  gameAddress: Address,
  maxWaitMs: number,
  pollingInterval: number
): Promise<{
  gameMaxClockDurationSeconds: string;
  resolveClaimTxHash?: `0x${string}`;
  resolveGameTxHash?: `0x${string}`;
  gameStatusAfterResolve: string;
}> {
  const maxClockDuration = (await publicClientL1.readContract({
    address: gameAddress,
    abi: disputeGameResolverAbi,
    functionName: "maxClockDuration"
  })) as bigint;
  const startedAt = Date.now();
  let resolveClaimTxHash: `0x${string}` | undefined;
  let resolveGameTxHash: `0x${string}` | undefined;

  while (Date.now() - startedAt <= maxWaitMs) {
    const status = Number(
      await publicClientL1.readContract({
        address: gameAddress,
        abi: disputeGameResolverAbi,
        functionName: "status"
      })
    );

    if (status !== 0) {
      return {
        gameMaxClockDurationSeconds: maxClockDuration.toString(),
        resolveClaimTxHash,
        resolveGameTxHash,
        gameStatusAfterResolve: disputeGameStatusName(status)
      };
    }

    const rootSubgameResolved = (await publicClientL1.readContract({
      address: gameAddress,
      abi: disputeGameResolverAbi,
      functionName: "resolvedSubgames",
      args: [0n]
    })) as boolean;

    if (!rootSubgameResolved) {
      const challengerDuration = (await publicClientL1.readContract({
        address: gameAddress,
        abi: disputeGameResolverAbi,
        functionName: "getChallengerDuration",
        args: [0n]
      })) as bigint;

      if (challengerDuration < maxClockDuration) {
        const secondsRemaining = maxClockDuration - challengerDuration;
        const waitMs = Math.min(Number(secondsRemaining * 1000n) + 2_000, pollingInterval);
        await sleep(Math.max(waitMs, 1_000));
        continue;
      }

      console.log(`Resolving uncontested dispute game root claim at ${gameAddress}.`);
      resolveClaimTxHash = await walletClientL1.writeContract({
        address: gameAddress,
        abi: disputeGameResolverAbi,
        functionName: "resolveClaim",
        args: [0n, 0n],
        account
      });

      const resolveClaimReceipt = await publicClientL1.waitForTransactionReceipt({
        hash: resolveClaimTxHash,
        confirmations: 1,
        timeout: maxWaitMs
      });

      if (resolveClaimReceipt.status !== "success") {
        throw new Error(`Dispute game root claim resolution failed: ${resolveClaimTxHash}`);
      }
    }

    console.log(`Resolving dispute game at ${gameAddress}.`);
    try {
      resolveGameTxHash = await walletClientL1.writeContract({
        address: gameAddress,
        abi: disputeGameResolverAbi,
        functionName: "resolve",
        account
      });
    } catch (error) {
      if (!isGameAlreadyResolved(error)) throw error;
      const resolvedStatus = Number(
        await publicClientL1.readContract({
          address: gameAddress,
          abi: disputeGameResolverAbi,
          functionName: "status"
        })
      );
      if (resolvedStatus !== 0) {
        return {
          gameMaxClockDurationSeconds: maxClockDuration.toString(),
          resolveClaimTxHash,
          resolveGameTxHash,
          gameStatusAfterResolve: disputeGameStatusName(resolvedStatus)
        };
      }
      throw error;
    }

    const resolveGameReceipt = await publicClientL1.waitForTransactionReceipt({
      hash: resolveGameTxHash,
      confirmations: 1,
      timeout: maxWaitMs
    });

    if (resolveGameReceipt.status !== "success") {
      throw new Error(`Dispute game resolution failed: ${resolveGameTxHash}`);
    }

    const resolvedStatus = Number(
      await publicClientL1.readContract({
        address: gameAddress,
        abi: disputeGameResolverAbi,
        functionName: "status"
      })
    );

    return {
      gameMaxClockDurationSeconds: maxClockDuration.toString(),
      resolveClaimTxHash,
      resolveGameTxHash,
      gameStatusAfterResolve: disputeGameStatusName(resolvedStatus)
    };
  }

  throw new Error(`Dispute game ${gameAddress} was not resolved after ${maxWaitMs}ms.`);
}

async function main(): Promise<void> {
  if (process.env.TESTNET_WITHDRAWAL_SMOKE_ENABLED !== "true") {
    console.log("Testnet withdrawal smoke disabled. Set TESTNET_WITHDRAWAL_SMOKE_ENABLED=true to run.");
    return;
  }

  const chain = readJson<ChainConfig>("chain/configs/testnet/chain.json");
  const addresses = readJson<AddressConfig>("chain/configs/testnet/addresses.json");
  const parentChainId = 84532 as const;
  if (chain.parentChain.chainId !== parentChainId) {
    throw new Error(`Testnet parent chain ID must be ${parentChainId}.`);
  }
  const l3RpcUrl = optionalEnv("TESTNET_PUBLIC_RPC_URL", chain.rpcUrls.public);
  const parentRpcUrl = optionalEnv(
    "TESTNET_WITHDRAWAL_PARENT_RPC_URL",
    optionalEnv("TESTNET_SUBMITTER_PARENT_RPC_FALLBACK_URL", requireEnv("PARENT_RPC_URL"))
  );
  const privateKey = requireEnv("TESTNET_DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const amountEth = optionalEnv("TESTNET_WITHDRAWAL_SMOKE_AMOUNT_ETH", "0.0001");
  const amountWei = parseEther(amountEth);
  const maxWaitMs = Number(optionalEnv("TESTNET_WITHDRAWAL_MAX_WAIT_MS", "900000"));
  const pollingInterval = Number(optionalEnv("TESTNET_WITHDRAWAL_POLL_INTERVAL_MS", "12000"));
  const autoResolveGame = optionalEnv("TESTNET_WITHDRAWAL_AUTO_RESOLVE_GAME", "true") === "true";
  const resumeInitiateTxHash = process.env.TESTNET_WITHDRAWAL_INITIATE_TX_HASH as `0x${string}` | undefined;

  const portalAddress = requireAddress("parentChain.portal", addresses.parentChain.portal);
  const disputeGameFactoryAddress = requireAddress("parentChain.disputeGameFactory", addresses.parentChain.disputeGameFactory);
  requireAddress("parentChain.standardBridge", addresses.parentChain.standardBridge);
  requireAddress("parentChain.crossDomainMessenger", addresses.parentChain.crossDomainMessenger);

  const vellumTestnet = defineChain({
    ...chainConfig,
    id: chain.chainId,
    name: "Vellum Testnet",
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: {
        http: [l3RpcUrl],
        webSocket: [chain.rpcUrls.websocket]
      }
    },
    blockExplorers: {
      default: {
        name: "Vellum Explorer",
        url: chain.explorerUrl
      }
    },
    contracts: {
      ...chainConfig.contracts,
      portal: {
        84532: {
          address: portalAddress
        }
      },
      disputeGameFactory: {
        84532: {
          address: disputeGameFactoryAddress
        }
      },
      l2OutputOracle: {
        84532: {
          address: zeroAddress
        }
      }
    },
    sourceId: parentChainId,
    testnet: true
  });

  const account = privateKeyToAccount(privateKey);
  const publicClientL1 = createPublicClient({
    chain: baseSepolia,
    transport: http(parentRpcUrl),
    pollingInterval
  });
  const walletClientL1 = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(parentRpcUrl)
  });
  const publicClientL3 = createPublicClient({
    chain: vellumTestnet,
    transport: http(l3RpcUrl),
    pollingInterval
  });
  const walletClientL3 = createWalletClient({
    account,
    chain: vellumTestnet,
    transport: http(l3RpcUrl)
  });

  const observedParentChainId = await publicClientL1.getChainId();
  const observedL3ChainId = await publicClientL3.getChainId();

  if (observedParentChainId !== parentChainId) {
    throw new Error(`Parent RPC returned chain ID ${observedParentChainId}, expected ${parentChainId}.`);
  }
  if (observedL3ChainId !== chain.chainId) {
    throw new Error(`Vellum RPC returned chain ID ${observedL3ChainId}, expected ${chain.chainId}.`);
  }

  const [l3BalanceBefore, parentBalanceBefore] = await Promise.all([
    publicClientL3.getBalance({ address: account.address }),
    publicClientL1.getBalance({ address: account.address })
  ]);

  if (l3BalanceBefore <= amountWei) {
    throw new Error(`Insufficient Vellum ETH for withdrawal smoke. Balance is ${formatEther(l3BalanceBefore)} ETH.`);
  }

  let initiateTxHash: `0x${string}`;
  let initiateReceipt: Awaited<ReturnType<typeof publicClientL3.waitForTransactionReceipt>>;

  if (resumeInitiateTxHash) {
    console.log(`Resuming withdrawal smoke from initiated L3 transaction: ${resumeInitiateTxHash}`);
    initiateTxHash = resumeInitiateTxHash;
    initiateReceipt = await publicClientL3.getTransactionReceipt({ hash: initiateTxHash });
  } else {
    console.log(`Initiating ${amountEth} ETH withdrawal from Vellum Testnet to Base Sepolia.`);
    initiateTxHash = await initiateWithdrawal(walletClientL3, {
      account,
      request: {
        gas: 21_000n,
        to: account.address,
        value: amountWei
      }
    });

    initiateReceipt = await publicClientL3.waitForTransactionReceipt({
      hash: initiateTxHash,
      confirmations: 1,
      timeout: maxWaitMs
    });
  }

  if (initiateReceipt.status !== "success") {
    throw new Error(`Withdrawal initiation failed: ${initiateTxHash}`);
  }

  const [withdrawal] = getWithdrawals({ logs: initiateReceipt.logs });
  if (!withdrawal) throw new Error(`No withdrawal log found in transaction ${initiateTxHash}.`);

  console.log(`Withdrawal initiated at L3 block ${initiateReceipt.blockNumber.toString()}: ${initiateTxHash}`);
  console.log(`Withdrawal hash: ${withdrawal.withdrawalHash}`);

  const statusBeforeProof = await getWithdrawalStatus(publicClientL1, {
    chain: null,
    receipt: initiateReceipt,
    targetChain: vellumTestnet
  });

  let proveTxHash: `0x${string}` | undefined;
  let gameAddress: Address | undefined;
  let disputeGameResolution: Awaited<ReturnType<typeof resolveUncontestedDisputeGame>> | undefined;

  if (statusBeforeProof === "waiting-to-prove" || statusBeforeProof === "ready-to-prove") {
    const proveReadiness = await withTimeout(
      waitToProve(publicClientL1, {
        receipt: initiateReceipt,
        targetChain: vellumTestnet,
        pollingInterval
      }),
      maxWaitMs,
      "Waiting for withdrawal proof readiness"
    );

    const proveArgs = await buildProveWithdrawal(publicClientL3, {
      account,
      game: proveReadiness.game,
      withdrawal: proveReadiness.withdrawal
    });

    gameAddress = disputeGameAddressFromMetadata(proveReadiness.game.metadata);
    console.log(`Proving withdrawal against dispute game index ${proveReadiness.game.index.toString()} at ${gameAddress}.`);
    proveTxHash = await proveWithdrawal(walletClientL1, {
      ...proveArgs,
      account
    });

    const proveReceipt = await publicClientL1.waitForTransactionReceipt({
      hash: proveTxHash,
      confirmations: 1,
      timeout: maxWaitMs
    });

    if (proveReceipt.status !== "success") {
      throw new Error(`Withdrawal prove transaction failed: ${proveTxHash}`);
    }

    console.log(`Withdrawal proof accepted on Base Sepolia: ${proveTxHash}`);

    disputeGameResolution = autoResolveGame
      ? await resolveUncontestedDisputeGame(publicClientL1, walletClientL1, account, gameAddress, maxWaitMs, pollingInterval)
      : undefined;
  } else {
    console.log(`Withdrawal already past prove step: ${statusBeforeProof}.`);
  }

  if (statusBeforeProof === "finalized") {
    const [l3BalanceAfter, parentBalanceAfter] = await Promise.all([
      publicClientL3.getBalance({ address: account.address }),
      publicClientL1.getBalance({ address: account.address })
    ]);

    const result: SmokeResult = {
      chainId: chain.chainId,
      parentChainId,
      l3RpcUrl,
      amountEth,
      account: account.address,
      withdrawalHash: withdrawal.withdrawalHash,
      initiateTxHash,
      initiateBlockNumber: initiateReceipt.blockNumber.toString(),
      finalStatus: statusBeforeProof,
      resumedFromInitiateTxHash: resumeInitiateTxHash,
      l3BalanceBeforeEth: formatEther(l3BalanceBefore),
      l3BalanceAfterEth: formatEther(l3BalanceAfter),
      parentBalanceBeforeEth: formatEther(parentBalanceBefore),
      parentBalanceAfterEth: formatEther(parentBalanceAfter)
    };

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { timeToFinalize, status: statusAfterProof } = await waitForFinalizationTiming(
    publicClientL1,
    withdrawal.withdrawalHash,
    initiateReceipt,
    vellumTestnet,
    maxWaitMs,
    pollingInterval
  );

  if (timeToFinalize.seconds * 1000 > maxWaitMs) {
    const [l3BalanceAfter, parentBalanceAfter] = await Promise.all([
      publicClientL3.getBalance({ address: account.address }),
      publicClientL1.getBalance({ address: account.address })
    ]);

    const result: SmokeResult = {
      chainId: chain.chainId,
      parentChainId,
      l3RpcUrl,
      amountEth,
      account: account.address,
      withdrawalHash: withdrawal.withdrawalHash,
      initiateTxHash,
      initiateBlockNumber: initiateReceipt.blockNumber.toString(),
      proveTxHash,
      gameAddress,
      gameMaxClockDurationSeconds: disputeGameResolution?.gameMaxClockDurationSeconds,
      resolveClaimTxHash: disputeGameResolution?.resolveClaimTxHash,
      resolveGameTxHash: disputeGameResolution?.resolveGameTxHash,
      gameStatusAfterResolve: disputeGameResolution?.gameStatusAfterResolve,
      finalStatus: statusAfterProof,
      resumedFromInitiateTxHash: resumeInitiateTxHash,
      proofMaturitySeconds: timeToFinalize.period,
      secondsToFinalize: timeToFinalize.seconds,
      finalizationPending: true,
      l3BalanceBeforeEth: formatEther(l3BalanceBefore),
      l3BalanceAfterEth: formatEther(l3BalanceAfter),
      parentBalanceBeforeEth: formatEther(parentBalanceBefore),
      parentBalanceAfterEth: formatEther(parentBalanceAfter)
    };

    console.log(JSON.stringify(result, null, 2));

    if (process.env.TESTNET_WITHDRAWAL_ALLOW_PENDING_FINALIZE === "true") return;
    throw new Error(`Withdrawal proved but cannot finalize within ${maxWaitMs}ms. Seconds remaining: ${timeToFinalize.seconds}.`);
  }

  await withTimeout(
    waitToFinalize(publicClientL1, {
      withdrawalHash: withdrawal.withdrawalHash,
      targetChain: vellumTestnet
    }),
    maxWaitMs,
    "Waiting for withdrawal finalization readiness"
  );

  console.log("Finalizing withdrawal.");
  const finalizeTxHash = await finalizeWithdrawal(walletClientL1, {
    account,
    targetChain: vellumTestnet,
    withdrawal
  });

  const finalizeReceipt = await publicClientL1.waitForTransactionReceipt({
    hash: finalizeTxHash,
    confirmations: 1,
    timeout: maxWaitMs
  });

  if (finalizeReceipt.status !== "success") {
    throw new Error(`Withdrawal finalize transaction failed: ${finalizeTxHash}`);
  }

  const [l3BalanceAfter, parentBalanceAfter] = await Promise.all([
    publicClientL3.getBalance({ address: account.address }),
    publicClientL1.getBalance({ address: account.address })
  ]);

  const finalStatus = await getWithdrawalStatus(publicClientL1, {
    receipt: initiateReceipt,
    targetChain: vellumTestnet
  });

  const result: SmokeResult = {
    chainId: chain.chainId,
    parentChainId,
    l3RpcUrl,
    amountEth,
    account: account.address,
    withdrawalHash: withdrawal.withdrawalHash,
    initiateTxHash,
    initiateBlockNumber: initiateReceipt.blockNumber.toString(),
    proveTxHash,
    gameAddress,
    gameMaxClockDurationSeconds: disputeGameResolution?.gameMaxClockDurationSeconds,
    resolveClaimTxHash: disputeGameResolution?.resolveClaimTxHash,
    resolveGameTxHash: disputeGameResolution?.resolveGameTxHash,
    gameStatusAfterResolve: disputeGameResolution?.gameStatusAfterResolve,
    finalizeTxHash,
    finalStatus,
    resumedFromInitiateTxHash: resumeInitiateTxHash,
    l3BalanceBeforeEth: formatEther(l3BalanceBefore),
    l3BalanceAfterEth: formatEther(l3BalanceAfter),
    parentBalanceBeforeEth: formatEther(parentBalanceBefore),
    parentBalanceAfterEth: formatEther(parentBalanceAfter)
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
