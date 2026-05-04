import { readFileSync } from "node:fs";

import {
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
  finalizeTxHash?: string;
  finalStatus: string;
  proofMaturitySeconds?: number;
  secondsToFinalize?: number;
  finalizationPending?: boolean;
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

  console.log(`Initiating ${amountEth} ETH withdrawal from Vellum Testnet to Base Sepolia.`);
  const initiateTxHash = await initiateWithdrawal(walletClientL3, {
    account,
    request: {
      gas: 21_000n,
      to: account.address,
      value: amountWei
    }
  });

  const initiateReceipt = await publicClientL3.waitForTransactionReceipt({
    hash: initiateTxHash,
    confirmations: 1,
    timeout: maxWaitMs
  });

  if (initiateReceipt.status !== "success") {
    throw new Error(`Withdrawal initiation failed: ${initiateTxHash}`);
  }

  const [withdrawal] = getWithdrawals({ logs: initiateReceipt.logs });
  if (!withdrawal) throw new Error(`No withdrawal log found in transaction ${initiateTxHash}.`);

  console.log(`Withdrawal initiated at L3 block ${initiateReceipt.blockNumber.toString()}: ${initiateTxHash}`);
  console.log(`Withdrawal hash: ${withdrawal.withdrawalHash}`);

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

  console.log(`Proving withdrawal against dispute game index ${proveReadiness.game.index.toString()}.`);
  const proveTxHash = await proveWithdrawal(walletClientL1, {
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

  const timeToFinalize = await getTimeToFinalize(publicClientL1, {
    withdrawalHash: withdrawal.withdrawalHash,
    targetChain: vellumTestnet
  });
  const statusAfterProof = await getWithdrawalStatus(publicClientL1, {
    receipt: initiateReceipt,
    targetChain: vellumTestnet
  });

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
      finalStatus: statusAfterProof,
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
    finalizeTxHash,
    finalStatus,
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
