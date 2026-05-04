import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assert, isAddress, isPlaceholderUrl, isZeroAddress, readJson } from "./lib/common";

const zeroAddress = "0x0000000000000000000000000000000000000000";
const l3StandardBridge = "0x4200000000000000000000000000000000000010";
const l3CrossDomainMessenger = "0x4200000000000000000000000000000000000007";
const l3Weth = "0x4200000000000000000000000000000000000006";
const l3Multicall3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

type ChainConfig = {
  name: string;
  slug: string;
  chainId: number;
  chainIdHex: string;
  parentChain: { name: string; chainId: number };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockTimeSeconds: number;
  bridgeType: string;
  rpcUrls: { public: string; websocket: string; private: string };
  explorerUrl: string;
  statusUrl: string;
  allowPlaceholderAddresses: boolean;
};

type ProjectConfig = {
  project: { name: string; slug: string };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  environments: Record<string, {
    chainId: number;
    parentChainId: number;
    parentChainName: string;
    publicRpc: string;
    websocketRpc: string;
    explorer: string;
    withdrawalChallengePeriodSeconds: number;
    allowPlaceholderAddresses: boolean;
  }>;
};

type Genesis = {
  config: { chainId: number };
  timestamp: string;
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

type L1Addresses = Record<string, unknown>;

type DeploymentState = {
  superchainContracts?: L1Addresses;
  implementationsDeployment?: L1Addresses;
  opChainDeployments?: Array<L1Addresses & { id?: string | number }>;
};

type ChainAddresses = {
  parentChain: {
    portal: string;
    standardBridge: string;
    crossDomainMessenger: string;
    systemConfig: string;
    l2OutputOracle: string;
    disputeGameFactory: string;
  };
  l3: {
    standardBridge: string;
    crossDomainMessenger: string;
    weth: string;
    multicall3: string;
  };
};

const dryRun = process.argv.includes("--dry-run");
const allowPlaceholders = process.env.TESTNET_IMPORT_ALLOW_PLACEHOLDERS === "1";
const artifactDir = process.env.TESTNET_ARTIFACT_DIR || "chain/testnet/artifacts";
const bridgeOutputDir = "bridge/superbridge/testnet";

function readArtifact<T>(name: string): T {
  const path = join(artifactDir, name);
  assert(existsSync(path), `Missing testnet artifact: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function maybeReadArtifact<T>(names: string[]): T | undefined {
  for (const name of names) {
    const path = join(artifactDir, name);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    }
  }
  return undefined;
}

function writeJson(path: string, value: unknown): void {
  if (dryRun) {
    console.log(`[dry-run] would write ${path}`);
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string): void {
  if (dryRun) {
    console.log(`[dry-run] would write ${path}`);
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function copyAsset(source: string, destination: string): void {
  if (dryRun) {
    console.log(`[dry-run] would copy ${source} -> ${destination}`);
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function rollupChainId(config: RollupConfig): number {
  return config.l2_chain_id ?? config.chain_id ?? 0;
}

function asChainId(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  assert(typeof value === "string" && value.length > 0, "Deployment state chain id is missing.");
  return Number(BigInt(value));
}

function requiredAddress(source: L1Addresses, key: string): string {
  const value = source[key];
  assert(isAddress(value), `${key} must be an EVM address.`);
  assert(!isZeroAddress(value), `${key} must not be zero.`);
  return value;
}

function optionalAddress(source: L1Addresses, key: string): string {
  const value = source[key];
  if (value === undefined) return zeroAddress;
  assert(isAddress(value), `${key} must be an EVM address.`);
  return value;
}

function envAddress(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (allowPlaceholders && !value) return zeroAddress;
  assert(isAddress(value), `${name} must be set to a deployed EVM address.`);
  assert(!isZeroAddress(value), `${name} must not be zero.`);
  return value;
}

function endpoint(name: string, fallback: string, pattern: RegExp): string {
  const value = process.env[name] || fallback;
  assert(pattern.test(value), `${name} must be a valid ${pattern.source.includes("wss") ? "WebSocket" : "HTTP"} URL.`);
  if (!allowPlaceholders) {
    assert(!isPlaceholderUrl(value), `${name} must not be a placeholder URL.`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= 0, `${name} must be a non-negative integer.`);
  return parsed;
}

function l1AddressesFromArtifacts(chainId: number): L1Addresses {
  const direct = maybeReadArtifact<L1Addresses>(["l1-addresses.json", "l1.json", "addresses.json"]);
  if (direct) return direct;

  const state = readArtifact<DeploymentState>("state.json");
  const deployment = state.opChainDeployments?.find((item) => asChainId(item.id) === chainId);
  assert(deployment, `state.json does not contain an opChainDeployment for chain ID ${chainId}.`);

  return {
    ...(state.superchainContracts || {}),
    ...(state.implementationsDeployment || {}),
    ...deployment
  };
}

function buildChainAddresses(l1: L1Addresses): ChainAddresses {
  const disputeGameFactory = optionalAddress(l1, "DisputeGameFactoryProxy");
  const l2OutputOracle = optionalAddress(l1, "L2OutputOracleProxy");
  assert(!isZeroAddress(disputeGameFactory) || !isZeroAddress(l2OutputOracle), "DisputeGameFactoryProxy or L2OutputOracleProxy must be deployed.");

  return {
    parentChain: {
      portal: requiredAddress(l1, "OptimismPortalProxy"),
      standardBridge: requiredAddress(l1, "L1StandardBridgeProxy"),
      crossDomainMessenger: requiredAddress(l1, "L1CrossDomainMessengerProxy"),
      systemConfig: requiredAddress(l1, "SystemConfigProxy"),
      l2OutputOracle,
      disputeGameFactory
    },
    l3: {
      standardBridge: l3StandardBridge,
      crossDomainMessenger: l3CrossDomainMessenger,
      weth: l3Weth,
      multicall3: envAddress("TESTNET_L3_MULTICALL3_ADDRESS", l3Multicall3)
    }
  };
}

function buildBridgeMetadata(
  chain: ChainConfig,
  addresses: ChainAddresses,
  publicRpc: string,
  websocketRpc: string,
  explorerUrl: string,
  statusUrl: string,
  withdrawalChallengePeriodSeconds: number
): unknown {
  return {
    name: chain.name,
    slug: chain.slug,
    chainId: chain.chainId,
    parentChainId: chain.parentChain.chainId,
    parentChainName: chain.parentChain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      public: publicRpc,
      websocket: websocketRpc
    },
    explorers: [
      {
        name: `${chain.name} Explorer`,
        url: explorerUrl,
        standard: "EIP3091"
      }
    ],
    bridge: {
      type: chain.bridgeType,
      recommendedFrontend: "Superbridge",
      parentChainPortalAddress: addresses.parentChain.portal,
      parentChainStandardBridgeAddress: addresses.parentChain.standardBridge,
      parentChainCrossDomainMessengerAddress: addresses.parentChain.crossDomainMessenger,
      l3StandardBridgeAddress: addresses.l3.standardBridge,
      l3CrossDomainMessengerAddress: addresses.l3.crossDomainMessenger,
      withdrawalChallengePeriodSeconds,
      supportsForcedWithdrawals: true,
      supportsEthDeposits: true,
      supportsErc20Deposits: true
    },
    status: {
      homepage: statusUrl,
      health: `${publicRpc.replace(/\/$/, "")}/health`
    },
    brand: {
      icon: process.env.TESTNET_BRAND_ICON_URL || "https://vellum.example/icon.png",
      logo: process.env.TESTNET_BRAND_LOGO_URL || "https://vellum.example/logo.svg"
    }
  };
}

function buildBridgeAddresses(chain: ChainConfig, addresses: ChainAddresses): unknown {
  return {
    parentChain: {
      name: chain.parentChain.name,
      chainId: chain.parentChain.chainId,
      contracts: addresses.parentChain
    },
    l3: {
      name: chain.name,
      chainId: chain.chainId,
      contracts: addresses.l3
    }
  };
}

function buildTokenList(chain: ChainConfig): unknown {
  return {
    name: `${chain.name} Token List`,
    timestamp: new Date().toISOString(),
    version: {
      major: 1,
      minor: 0,
      patch: 0
    },
    tokens: [
      {
        chainId: chain.parentChain.chainId,
        address: zeroAddress,
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
        logoURI: "https://vellum.example/assets/eth.png",
        extensions: {
          native: true
        }
      },
      {
        chainId: chain.chainId,
        address: zeroAddress,
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
        logoURI: "https://vellum.example/assets/eth.png",
        extensions: {
          native: true,
          parentChainId: chain.parentChain.chainId
        }
      }
    ]
  };
}

function buildIntegrationNotes(
  chain: ChainConfig,
  addresses: ChainAddresses,
  publicRpc: string,
  websocketRpc: string,
  explorerUrl: string,
  statusUrl: string,
  withdrawalChallengePeriodSeconds: number,
  proofMaturityDelaySeconds: number,
  disputeGameFinalityDelaySeconds: number
): string {
  const ethDepositTx = process.env.TESTNET_ETH_DEPOSIT_TX_HASH || "TODO before external handoff";
  const ethWithdrawalInitiatedTx = process.env.TESTNET_ETH_WITHDRAWAL_INITIATED_TX_HASH || "TODO before external handoff";
  const ethWithdrawalProofTx = process.env.TESTNET_ETH_WITHDRAWAL_PROOF_TX_HASH || "TODO before external handoff";
  const ethWithdrawalFinalizationTx = process.env.TESTNET_ETH_WITHDRAWAL_FINALIZATION_TX_HASH || "pending until proof maturity delay has elapsed";
  const erc20DepositTx = process.env.TESTNET_ERC20_DEPOSIT_TX_HASH || "TODO before external handoff";
  const erc20WithdrawalTx = process.env.TESTNET_ERC20_WITHDRAWAL_TX_HASH || "TODO before external handoff";

  return `# Superbridge Testnet Integration Notes

## Chain

- Name: ${chain.name}
- Slug: ${chain.slug}
- Native gas token: ETH
- Parent chain: ${chain.parentChain.name}
- Parent chain ID: ${chain.parentChain.chainId}
- Bridge type: OP Stack canonical

## Package Files

- Chain metadata: \`chain-metadata.json\`
- Bridge addresses: \`bridge-addresses.json\`
- Token list: \`token-list.json\`
- Icon asset: \`assets/icon.png\`
- Logo asset: \`assets/logo.svg\`

## URLs

- Public RPC: \`${publicRpc}\`
- WebSocket RPC: \`${websocketRpc}\`
- Explorer: \`${explorerUrl}\`
- Status page: \`${statusUrl}\`

## Bridge Contract Addresses

- Parent portal: \`${addresses.parentChain.portal}\`
- Parent standard bridge: \`${addresses.parentChain.standardBridge}\`
- Parent cross-domain messenger: \`${addresses.parentChain.crossDomainMessenger}\`
- Parent system config: \`${addresses.parentChain.systemConfig}\`
- Parent dispute game factory: \`${addresses.parentChain.disputeGameFactory}\`
- Parent L2 output oracle: \`${addresses.parentChain.l2OutputOracle}\`
- L3 standard bridge: \`${addresses.l3.standardBridge}\`
- L3 cross-domain messenger: \`${addresses.l3.crossDomainMessenger}\`
- L3 WETH: \`${addresses.l3.weth}\`
- L3 Multicall3: \`${addresses.l3.multicall3}\`

## Withdrawal Timing

- Withdrawal challenge period: ${withdrawalChallengePeriodSeconds} seconds
- Proof maturity delay: ${proofMaturityDelaySeconds} seconds
- Dispute game finality delay: ${disputeGameFinalityDelaySeconds} seconds

The live portal timing is the source of truth for this testnet deployment.
Metadata should match the longer live portal delay, not a local smoke test
target.

## Test Transactions

- ETH deposit: ${ethDepositTx}
- ETH withdrawal initiated: ${ethWithdrawalInitiatedTx}
- ETH withdrawal proof: ${ethWithdrawalProofTx}
- ETH withdrawal finalization: ${ethWithdrawalFinalizationTx}
- ERC-20 deposit: ${erc20DepositTx}
- ERC-20 withdrawal: ${erc20WithdrawalTx}

## Contacts

- Security contact: TODO before external handoff
- Incident contact: TODO before external handoff

## Custom Behavior

No custom behavior. ETH is the native gas token, ERC-20 bridging uses standard
OP Stack bridge paths, and no custom gas token behavior is planned.
`;
}

const chain = readJson<ChainConfig>("chain/configs/testnet/chain.json");
const project = readJson<ProjectConfig>("config/project.json");
const genesis = readArtifact<Genesis>("genesis.json");
const rollup = readArtifact<RollupConfig>("rollup.json");
const l1Addresses = l1AddressesFromArtifacts(chain.chainId);
const publicRpc = endpoint("TESTNET_PUBLIC_RPC_URL", chain.rpcUrls.public, /^https?:\/\//);
const websocketRpc = endpoint("TESTNET_WS_RPC_URL", chain.rpcUrls.websocket, /^wss?:\/\//);
const explorerUrl = endpoint("TESTNET_EXPLORER_URL", chain.explorerUrl, /^https?:\/\//);
const statusUrl = endpoint("TESTNET_STATUS_URL", chain.statusUrl, /^https?:\/\//);
const withdrawalChallengePeriodSeconds = numberEnv(
  "TESTNET_WITHDRAWAL_CHALLENGE_PERIOD_SECONDS",
  project.environments.testnet.withdrawalChallengePeriodSeconds
);
const proofMaturityDelaySeconds = numberEnv("TESTNET_PROOF_MATURITY_DELAY_SECONDS", withdrawalChallengePeriodSeconds);
const disputeGameFinalityDelaySeconds = numberEnv("TESTNET_DISPUTE_GAME_FINALITY_DELAY_SECONDS", 0);
const chainAddresses = buildChainAddresses(l1Addresses);

assert(chain.chainId > 0, "Testnet chain ID must be selected before importing artifacts.");
assert(chain.chainIdHex === `0x${chain.chainId.toString(16)}`, "Testnet chain ID hex is not consistent.");
assert(chain.parentChain.chainId === 84532, "Testnet parent chain must be Base Sepolia 84532.");
assert(genesis.config.chainId === chain.chainId, `Genesis chain ID must be ${chain.chainId}.`);
assert(genesis.timestamp !== "0x0", "Genesis timestamp must be generated by op-deployer.");
assert(Object.keys(genesis.alloc || {}).length > 0, "Genesis alloc must not be empty.");
assert(rollupChainId(rollup) === chain.chainId, `Rollup chain ID must be ${chain.chainId}.`);
assert(rollup.l1_chain_id === chain.parentChain.chainId, "Rollup parent chain ID must match Base Sepolia.");
assert(rollup.block_time === chain.blockTimeSeconds, "Rollup block time must match chain config.");
assert(requiredAddress(l1Addresses, "SystemConfigProxy").toLowerCase() === rollup.l1_system_config_address.toLowerCase(), "Rollup system config must match L1 addresses.");
assert(requiredAddress(l1Addresses, "OptimismPortalProxy").toLowerCase() === rollup.deposit_contract_address.toLowerCase(), "Rollup deposit contract must match OptimismPortalProxy.");
assert(isAddress(rollup.batch_inbox_address), "Rollup batch inbox address must be an EVM address.");
assert(!isZeroAddress(rollup.batch_inbox_address), "Rollup batch inbox address must not be zero.");

const nextChain: ChainConfig = {
  ...chain,
  rpcUrls: {
    ...chain.rpcUrls,
    public: publicRpc,
    websocket: websocketRpc
  },
  explorerUrl,
  statusUrl
};

const nextProject: ProjectConfig = {
  ...project,
  environments: {
    ...project.environments,
    testnet: {
      ...project.environments.testnet,
      chainId: chain.chainId,
      parentChainId: chain.parentChain.chainId,
      parentChainName: chain.parentChain.name,
      publicRpc,
      websocketRpc,
      explorer: explorerUrl,
      withdrawalChallengePeriodSeconds
    }
  }
};

writeJson("chain/configs/testnet/chain.json", nextChain);
writeJson("config/project.json", nextProject);
writeJson("chain/configs/testnet/genesis.json", genesis);
writeJson("chain/configs/testnet/rollup.json", rollup);
writeJson("chain/configs/testnet/addresses.json", chainAddresses);
writeJson(`${bridgeOutputDir}/chain-metadata.json`, buildBridgeMetadata(nextChain, chainAddresses, publicRpc, websocketRpc, explorerUrl, statusUrl, withdrawalChallengePeriodSeconds));
writeJson(`${bridgeOutputDir}/bridge-addresses.json`, buildBridgeAddresses(nextChain, chainAddresses));
writeJson(`${bridgeOutputDir}/token-list.json`, buildTokenList(nextChain));
writeText(`${bridgeOutputDir}/integration-notes.md`, buildIntegrationNotes(
  nextChain,
  chainAddresses,
  publicRpc,
  websocketRpc,
  explorerUrl,
  statusUrl,
  withdrawalChallengePeriodSeconds,
  proofMaturityDelaySeconds,
  disputeGameFinalityDelaySeconds
));

for (const file of ["icon.svg", "icon.png", "logo.svg"]) {
  copyAsset(`bridge/superbridge/assets/${file}`, `${bridgeOutputDir}/assets/${file}`);
}

console.log(JSON.stringify({
  environment: "testnet",
  chainId: chain.chainId,
  parentChainId: chain.parentChain.chainId,
  artifactDir,
  bridgeOutputDir,
  dryRun,
  next: [
    "pnpm bridge:validate:testnet",
    "pnpm testnet:readiness:report",
    "pnpm testnet:validate"
  ]
}, null, 2));
