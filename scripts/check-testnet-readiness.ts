import { existsSync } from "node:fs";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { assert, isAddress, isPlaceholderUrl, isZeroAddress, readJson } from "./lib/common";

type ChainConfig = {
  chainId: number;
  chainIdHex: string;
  parentChain: { name: string; chainId: number };
  nativeCurrency: { symbol: string; decimals: number };
  blockTimeSeconds: number;
  bridgeType: string;
  rpcUrls: { public: string; websocket: string; private: string };
  explorerUrl: string;
  statusUrl: string;
  allowPlaceholderAddresses: boolean;
};

type Genesis = {
  config: { chainId: number };
  timestamp: string;
  gasLimit: string;
  alloc: Record<string, unknown>;
};

type RollupConfig = {
  chain_id?: number;
  l2_chain_id?: number;
  l1_chain_id: number;
  block_time: number;
  seq_window_size: number;
  channel_timeout: number;
  l1_system_config_address: string;
  batch_inbox_address: string;
  deposit_contract_address: string;
};

type AddressConfig = {
  parentChain: Record<string, string>;
  l3: Record<string, string>;
};

type BridgeConfig = {
  environment: string;
  chainId: number;
  parentChainId: number;
  bridgeType: string;
  metadataOutput: string;
  allowPlaceholderAddresses: boolean;
};

type BridgeMetadata = {
  chainId: number;
  parentChainId: number;
  rpcUrls: { public: string; websocket: string };
  explorers: Array<{ url: string }>;
  bridge: Record<string, unknown>;
};

type BridgeAddresses = {
  parentChain: { chainId: number; contracts: Record<string, string> };
  l3: { chainId: number; contracts: Record<string, string> };
};

type TokenList = {
  tokens: Array<{ chainId: number; symbol: string; extensions?: Record<string, unknown> }>;
};

const portalTimingAbi = [
  {
    type: "function",
    name: "proofMaturityDelaySeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "disputeGameFinalityDelaySeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  }
] as const;

type CheckStatus = "pass" | "fail" | "warn";

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
};

const expectedParentChainId = 84532;
const chain = readJson<ChainConfig>("chain/configs/testnet/chain.json");
const genesis = readJson<Genesis>("chain/configs/testnet/genesis.json");
const rollup = readJson<RollupConfig>("chain/configs/testnet/rollup.json");
const addresses = readJson<AddressConfig>("chain/configs/testnet/addresses.json");
const bridgeConfig = readJson<BridgeConfig>("bridge/configs/testnet.bridge.json");
const devnetChain = readJson<ChainConfig>("chain/configs/devnet/chain.json");
const mainnetChain = readJson<ChainConfig>("chain/configs/mainnet/chain.json");
const checks: Check[] = [];

function check(name: string, condition: unknown, detail: string): void {
  checks.push({ name, status: condition ? "pass" : "fail", detail });
}

function warn(name: string, condition: unknown, detail: string): void {
  checks.push({ name, status: condition ? "pass" : "warn", detail });
}

function isNonPlaceholderUrl(value: string): boolean {
  return /^https?:\/\//.test(value) && !isPlaceholderUrl(value);
}

function isNonPlaceholderWsUrl(value: string): boolean {
  return /^wss?:\/\//.test(value) && !isPlaceholderUrl(value);
}

function rollupChainId(config: RollupConfig): number {
  return config.l2_chain_id ?? config.chain_id ?? 0;
}

function nonZeroAddress(value: unknown): boolean {
  return isAddress(value) && !isZeroAddress(value);
}

function requiredAddressEntries(): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const [scope, contracts] of Object.entries(addresses)) {
    for (const [name, address] of Object.entries(contracts)) {
      if (scope === "parentChain" && name === "l2OutputOracle" && nonZeroAddress(addresses.parentChain.disputeGameFactory)) {
        continue;
      }
      entries.push([`${scope}.${name}`, address]);
    }
  }

  return entries;
}

function fileExists(path: string): boolean {
  return existsSync(path);
}

function maybeReadJson<T>(path: string): T | undefined {
  return fileExists(path) ? readJson<T>(path) : undefined;
}

async function rpcChainId(url: string): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    signal: AbortSignal.timeout(5000)
  });
  const body = await response.json() as { result?: string; error?: { message?: string } };

  assert(response.ok, `RPC HTTP status ${response.status}`);
  assert(typeof body.result === "string", body.error?.message || "RPC did not return eth_chainId");
  return Number(BigInt(body.result));
}

async function rpcEthCall(url: string, to: string, data: string): Promise<`0x${string}`> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json() as { result?: `0x${string}`; error?: { message?: string } };

  assert(response.ok, `RPC HTTP status ${response.status}`);
  assert(typeof body.result === "string", body.error?.message || "RPC did not return eth_call result");
  return body.result;
}

async function portalWithdrawalTiming(url: string, portalAddress: string): Promise<{
  proofMaturityDelaySeconds: number;
  disputeGameFinalityDelaySeconds: number;
  expectedWithdrawalChallengePeriodSeconds: number;
}> {
  const proofData = encodeFunctionData({ abi: portalTimingAbi, functionName: "proofMaturityDelaySeconds" });
  const finalityData = encodeFunctionData({ abi: portalTimingAbi, functionName: "disputeGameFinalityDelaySeconds" });
  const [proofResult, finalityResult] = await Promise.all([
    rpcEthCall(url, portalAddress, proofData),
    rpcEthCall(url, portalAddress, finalityData)
  ]);
  const proofMaturityDelaySeconds = Number(decodeFunctionResult({
    abi: portalTimingAbi,
    functionName: "proofMaturityDelaySeconds",
    data: proofResult
  }) as bigint);
  const disputeGameFinalityDelaySeconds = Number(decodeFunctionResult({
    abi: portalTimingAbi,
    functionName: "disputeGameFinalityDelaySeconds",
    data: finalityResult
  }) as bigint);

  return {
    proofMaturityDelaySeconds,
    disputeGameFinalityDelaySeconds,
    expectedWithdrawalChallengePeriodSeconds: Math.max(proofMaturityDelaySeconds, disputeGameFinalityDelaySeconds)
  };
}

async function main(): Promise<void> {
  check("parent chain", chain.parentChain.chainId === expectedParentChainId, "testnet parent must be Base Sepolia 84532");
  check("native gas", chain.nativeCurrency.symbol === "ETH" && chain.nativeCurrency.decimals === 18, "native gas must stay ETH");
  check("bridge type", chain.bridgeType === "op-stack-canonical", "testnet bridge must use OP Stack canonical semantics");
  check("chain id selected", chain.chainId > 0, "replace testnet chainId 0 with the public testnet chain ID");
  check("chain id hex", chain.chainIdHex === `0x${chain.chainId.toString(16)}`, "chainIdHex must match chainId");
  check(
    "chain id uniqueness",
    chain.chainId > 0 && chain.chainId !== devnetChain.chainId && chain.chainId !== mainnetChain.chainId,
    "testnet chain ID must not collide with devnet or mainnet config"
  );
  check("public rpc url", isNonPlaceholderUrl(chain.rpcUrls.public), "replace testnet public RPC placeholder");
  check("websocket rpc url", isNonPlaceholderWsUrl(chain.rpcUrls.websocket), "replace testnet WebSocket RPC placeholder");
  check("explorer url", isNonPlaceholderUrl(chain.explorerUrl), "replace testnet explorer placeholder");
  check("status url", isNonPlaceholderUrl(chain.statusUrl), "replace testnet status page placeholder");
  check("placeholder policy", chain.allowPlaceholderAddresses === false, "testnet must not allow placeholder addresses");

  check("genesis chain id", genesis.config.chainId === chain.chainId && genesis.config.chainId > 0, "genesis must be generated for the testnet chain ID");
  check("genesis timestamp", genesis.timestamp !== "0x0", "genesis timestamp must be generated by op-deployer");
  check("genesis alloc", Object.keys(genesis.alloc || {}).length > 0, "genesis alloc must not be empty");
  check("rollup chain id", rollupChainId(rollup) === chain.chainId && rollupChainId(rollup) > 0, "rollup chain ID must match chain config");
  check("rollup parent chain id", rollup.l1_chain_id === expectedParentChainId, "rollup parent chain ID must be Base Sepolia");
  check("rollup block time", rollup.block_time === chain.blockTimeSeconds, "rollup block time must match chain config");
  check("rollup window", rollup.seq_window_size > 0 && rollup.channel_timeout > 0, "rollup sequencing windows must be nonzero");
  check("rollup system config", nonZeroAddress(rollup.l1_system_config_address), "rollup l1_system_config_address must be deployed");
  check("rollup batch inbox", nonZeroAddress(rollup.batch_inbox_address), "rollup batch_inbox_address must be deployed");
  check("rollup deposit contract", nonZeroAddress(rollup.deposit_contract_address), "rollup deposit_contract_address must be deployed");

  for (const [name, address] of requiredAddressEntries()) {
    check(`address ${name}`, nonZeroAddress(address), `${name} must be a deployed nonzero address`);
  }

  check("bridge config environment", bridgeConfig.environment === "testnet", "bridge/configs/testnet.bridge.json must target testnet");
  check("bridge config chain id", bridgeConfig.chainId === chain.chainId && bridgeConfig.chainId > 0, "bridge config chain ID must match testnet chain");
  check("bridge config parent", bridgeConfig.parentChainId === expectedParentChainId, "bridge config parent must be Base Sepolia");
  check("bridge config metadata output", bridgeConfig.metadataOutput === "bridge/superbridge/testnet", "testnet Superbridge package must be isolated under bridge/superbridge/testnet");
  check("bridge config placeholders", bridgeConfig.allowPlaceholderAddresses === false, "bridge config must block placeholders");

  const bridgePackageFiles = [
    `${bridgeConfig.metadataOutput}/chain-metadata.json`,
    `${bridgeConfig.metadataOutput}/bridge-addresses.json`,
    `${bridgeConfig.metadataOutput}/token-list.json`,
    `${bridgeConfig.metadataOutput}/integration-notes.md`,
    `${bridgeConfig.metadataOutput}/assets/icon.svg`,
    `${bridgeConfig.metadataOutput}/assets/icon.png`,
    `${bridgeConfig.metadataOutput}/assets/logo.svg`
  ];

  for (const file of bridgePackageFiles) {
    check(`superbridge file ${file}`, fileExists(file), `${file} must be generated for testnet handoff`);
  }

  const bridgeMetadata = maybeReadJson<BridgeMetadata>(`${bridgeConfig.metadataOutput}/chain-metadata.json`);
  if (bridgeMetadata) {
    check("superbridge metadata chain id", bridgeMetadata.chainId === chain.chainId, "Superbridge metadata chain ID must match testnet");
    check("superbridge metadata parent", bridgeMetadata.parentChainId === expectedParentChainId, "Superbridge metadata parent must be Base Sepolia");
    check("superbridge metadata public rpc", isNonPlaceholderUrl(bridgeMetadata.rpcUrls.public), "Superbridge metadata public RPC must be final");
    check("superbridge metadata websocket rpc", isNonPlaceholderWsUrl(bridgeMetadata.rpcUrls.websocket), "Superbridge metadata WebSocket RPC must be final");
    check("superbridge metadata explorer", isNonPlaceholderUrl(bridgeMetadata.explorers[0]?.url || ""), "Superbridge metadata explorer must be final");

    for (const key of [
      "parentChainPortalAddress",
      "parentChainStandardBridgeAddress",
      "parentChainCrossDomainMessengerAddress",
      "l3StandardBridgeAddress",
      "l3CrossDomainMessengerAddress"
    ]) {
      check(`superbridge metadata ${key}`, nonZeroAddress(bridgeMetadata.bridge[key]), `${key} must be a deployed nonzero address`);
    }
  }

  const bridgeAddresses = maybeReadJson<BridgeAddresses>(`${bridgeConfig.metadataOutput}/bridge-addresses.json`);
  if (bridgeAddresses) {
    check("superbridge addresses parent", bridgeAddresses.parentChain.chainId === expectedParentChainId, "Superbridge bridge addresses parent must be Base Sepolia");
    check("superbridge addresses l3", bridgeAddresses.l3.chainId === chain.chainId, "Superbridge bridge addresses L3 chain ID must match testnet");
  }

  const tokenList = maybeReadJson<TokenList>(`${bridgeConfig.metadataOutput}/token-list.json`);
  if (tokenList) {
    const parentEth = tokenList.tokens.find((token) => token.chainId === expectedParentChainId && token.symbol === "ETH" && token.extensions?.native === true);
    const l3Eth = tokenList.tokens.find((token) => token.chainId === chain.chainId && token.symbol === "ETH" && token.extensions?.native === true);
    check("superbridge token parent eth", Boolean(parentEth), "Superbridge token list must include Base Sepolia native ETH");
    check("superbridge token l3 eth", Boolean(l3Eth), "Superbridge token list must include testnet native ETH");
  }

  const secretChecks = [
    ["PARENT_RPC_URL", process.env.PARENT_RPC_URL],
    ["PARENT_WS_URL", process.env.PARENT_WS_URL],
    ["TESTNET_DEPLOYER_PRIVATE_KEY", process.env.TESTNET_DEPLOYER_PRIVATE_KEY],
    ["TESTNET_BATCHER_PRIVATE_KEY", process.env.TESTNET_BATCHER_PRIVATE_KEY],
    ["TESTNET_PROPOSER_PRIVATE_KEY", process.env.TESTNET_PROPOSER_PRIVATE_KEY],
    ["TESTNET_SEQUENCER_PRIVATE_KEY", process.env.TESTNET_SEQUENCER_PRIVATE_KEY]
  ] as const;
  const requireSecrets = process.env.TESTNET_READINESS_REQUIRE_SECRETS === "1";

  for (const [name, value] of secretChecks) {
    if (requireSecrets) {
      check(`secret ${name}`, Boolean(value), `${name} must be provided by the deployment secret store`);
    } else {
      warn(`secret ${name}`, Boolean(value), `${name} not set; set TESTNET_READINESS_REQUIRE_SECRETS=1 to make this fatal`);
    }
  }

  if (process.env.TESTNET_READINESS_LIVE === "1") {
    const parentRpc = process.env.PARENT_RPC_URL;
    check("live parent rpc configured", Boolean(parentRpc), "PARENT_RPC_URL is required for live readiness");
    if (parentRpc) {
      const parentChainId = await rpcChainId(parentRpc);
      check("live parent rpc chain id", parentChainId === expectedParentChainId, `PARENT_RPC_URL returned chain ID ${parentChainId}`);

      const bridgeMetadata = maybeReadJson<BridgeMetadata>(`${bridgeConfig.metadataOutput}/chain-metadata.json`);
      const portalAddress = String(bridgeMetadata?.bridge.parentChainPortalAddress || "");
      if (bridgeMetadata && nonZeroAddress(portalAddress)) {
        const timing = await portalWithdrawalTiming(parentRpc, portalAddress);
        const metadataChallengePeriod = Number(bridgeMetadata.bridge.withdrawalChallengePeriodSeconds);
        check(
          "live portal withdrawal timing",
          metadataChallengePeriod === timing.expectedWithdrawalChallengePeriodSeconds,
          `metadata withdrawalChallengePeriodSeconds=${metadataChallengePeriod}; live proofMaturityDelaySeconds=${timing.proofMaturityDelaySeconds}; live disputeGameFinalityDelaySeconds=${timing.disputeGameFinalityDelaySeconds}`
        );
      }
    }

    if (isNonPlaceholderUrl(chain.rpcUrls.public)) {
      const l3ChainId = await rpcChainId(chain.rpcUrls.public);
      check("live l3 rpc chain id", l3ChainId === chain.chainId, `testnet public RPC returned chain ID ${l3ChainId}`);
    }
  }

  if (process.env.CHECK_CHAINLIST === "1" && chain.chainId > 0) {
    const response = await fetch("https://chainid.network/chains.json", { signal: AbortSignal.timeout(10000) });
    const chains = await response.json() as Array<{ chainId: number; name: string }>;
    const conflict = chains.find((item) => item.chainId === chain.chainId);
    check("remote chainlist conflict", !conflict, conflict ? `chain ID conflicts with ${conflict.name}` : "chain ID not present in chainid.network list");
  }

  const failed = checks.filter((item) => item.status === "fail");
  const warned = checks.filter((item) => item.status === "warn");

  for (const item of checks) {
    console.log(`[${item.status}] ${item.name}: ${item.detail}`);
  }

  console.log(JSON.stringify({
    environment: "testnet",
    ready: failed.length === 0,
    failed: failed.length,
    warnings: warned.length
  }, null, 2));

  if (failed.length > 0 && process.env.TESTNET_READINESS_ALLOW_BLOCKERS !== "1") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
