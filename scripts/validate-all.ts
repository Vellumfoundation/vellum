import { readFileSync } from "node:fs";
import {
  assert,
  assertFile,
  isAddress,
  isPlaceholderUrl,
  isZeroAddress,
  readJson,
  sha256File
} from "./lib/common";

type ProjectConfig = {
  project: { name: string; slug: string };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  parentChain: { name: string; chainId: number; testnetChainId: number };
  chain: { chainId: number; chainIdHex: string; blockTimeSeconds: number; bridgeType: string };
  urls: { publicRpc: string; websocketRpc: string; explorer: string; status: string };
};

type ChainConfig = {
  chainId: number;
  chainIdHex: string;
  parentChain: { name: string; chainId: number };
  nativeCurrency: { name: string; symbol: string; decimals: number };
  bridgeType: string;
  rpcUrls: { public: string; websocket: string };
  explorerUrl: string;
};

type GenesisConfig = {
  config: { chainId: number };
};

type RollupConfig = {
  chain_id?: number;
  l2_chain_id?: number;
  l1_chain_id: number;
  l1_system_config_address?: string;
  batch_inbox_address?: string;
  deposit_contract_address?: string;
};

type ChainAddresses = {
  parentChain: Record<string, string>;
  l3: Record<string, string>;
};

type BridgeMetadata = {
  chainId: number;
  parentChainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { public: string; websocket: string };
  explorers: Array<{ url: string }>;
  bridge: Record<string, unknown>;
};

type BridgeAddresses = {
  parentChain: { chainId: number; contracts: Record<string, string> };
  l3: { chainId: number; contracts: Record<string, string> };
};

type BridgeEnvironmentConfig = {
  chainId: number;
  parentChainId: number;
  metadataOutput: string;
};

const projectEnv = process.env.PROJECT_ENV || "development";
const production = projectEnv === "production" || projectEnv === "mainnet";
const testnet = projectEnv === "testnet";
const activeEnv = production ? "mainnet" : testnet ? "testnet" : "devnet";

const requiredFiles = [
  "README.md",
  "LICENSE",
  ".env.example",
  ".gitignore",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "config/project.json",
  "scripts/check-testnet-readiness.ts",
  "chain/README.md",
  "chain/configs/devnet/chain.json",
  "chain/configs/devnet/rollup.json",
  "chain/configs/devnet/genesis.json",
  "chain/configs/devnet/addresses.json",
  "chain/configs/testnet/chain.json",
  "chain/configs/testnet/rollup.json",
  "chain/configs/testnet/genesis.json",
  "chain/configs/testnet/addresses.json",
  "chain/configs/mainnet/chain.json",
  "chain/configs/mainnet/rollup.json",
  "chain/configs/mainnet/genesis.json",
  "chain/configs/mainnet/addresses.json",
  "contracts/README.md",
  "contracts/src/TokenBridgeRegistry.sol",
  "contracts/src/L3SystemConfigRegistry.sol",
  "contracts/src/Faucet.sol",
  "bridge/README.md",
  "bridge/configs/devnet.bridge.json",
  "bridge/configs/testnet.bridge.json",
  "bridge/configs/mainnet.bridge.json",
  "bridge/superbridge/chain-metadata.json",
  "bridge/superbridge/token-list.json",
  "bridge/superbridge/bridge-addresses.json",
  "bridge/superbridge/integration-notes.md",
  "bridge/superbridge/assets/icon.svg",
  "bridge/superbridge/assets/icon.png",
  "bridge/superbridge/assets/logo.svg",
  "bridge/superbridge/validation/validate-metadata.ts",
  "bridge/superbridge/validation/validate-token-list.ts",
  "bridge/superbridge/validation/validate-addresses.ts",
  "rpc/gateway/src/index.ts",
  "explorer/README.md",
  "monitoring/README.md",
  "infra/README.md",
  "sdk/README.md",
  "sdk/src/chains.ts",
  "sdk/examples/deploy-hardhat/hardhat.config.ts",
  "sdk/examples/deploy-foundry/foundry.toml",
  "docs/overview.md",
  "docs/architecture.md",
  "docs/chain-parameters.md",
  "docs/testnet-chain-id.md",
  "docs/testnet-deployment-artifacts.md",
  "docs/bridge.md",
  "docs/superbridge-compatibility.md",
  "docs/developer-quickstart.md",
  "docs/deploy-contracts.md",
  "docs/node-operator-guide.md",
  "docs/rpc.md",
  "docs/explorer.md",
  "docs/faucet.md",
  "docs/monitoring.md",
  "docs/security.md",
  "docs/incident-response.md",
  "docs/mainnet-launch-checklist.md",
  "docs/testnet-launch-checklist.md",
  "docs/testnet-readiness.md",
  "docs/runbooks/sequencer-failover.md",
  "docs/runbooks/rpc-failover.md",
  "docs/runbooks/bridge-incident.md",
  "docs/runbooks/explorer-reindex.md",
  "docs/runbooks/database-restore.md",
  "docs/runbooks/snapshot-restore.md",
  "docs/runbooks/emergency-pause.md",
  "docs/runbooks/release-rollback.md"
];

for (const file of requiredFiles) {
  assertFile(file);
}

const project = readJson<ProjectConfig>("config/project.json");
const chain = readJson<ChainConfig>(`chain/configs/${activeEnv}/chain.json`);
const genesis = readJson<GenesisConfig>(`chain/configs/${activeEnv}/genesis.json`);
const rollup = readJson<RollupConfig>(`chain/configs/${activeEnv}/rollup.json`);
const chainAddresses = readJson<ChainAddresses>(`chain/configs/${activeEnv}/addresses.json`);
const bridgeConfig = readJson<BridgeEnvironmentConfig>(`bridge/configs/${activeEnv}.bridge.json`);
const bridgePackageRequiredFiles = [
  `${bridgeConfig.metadataOutput}/chain-metadata.json`,
  `${bridgeConfig.metadataOutput}/bridge-addresses.json`,
  `${bridgeConfig.metadataOutput}/token-list.json`,
  `${bridgeConfig.metadataOutput}/integration-notes.md`,
  `${bridgeConfig.metadataOutput}/assets/icon.svg`,
  `${bridgeConfig.metadataOutput}/assets/icon.png`,
  `${bridgeConfig.metadataOutput}/assets/logo.svg`
];

for (const file of bridgePackageRequiredFiles) {
  assertFile(file);
}

const bridgeMetadata = readJson<BridgeMetadata>(`${bridgeConfig.metadataOutput}/chain-metadata.json`);
const bridgeAddresses = readJson<BridgeAddresses>(`${bridgeConfig.metadataOutput}/bridge-addresses.json`);

assert(project.project.name === "Vellum", "Project name must remain centralized as Vellum.");
assert(project.project.slug === "vellum", "Project slug must remain centralized as vellum.");
assert(project.nativeCurrency.name === "Ether", "Native currency name must be Ether.");
assert(project.nativeCurrency.symbol === "ETH", "Native currency symbol must be ETH.");
assert(project.nativeCurrency.decimals === 18, "Native currency decimals must be 18.");
assert(project.parentChain.name === "Base", "Parent chain must be Base.");
assert(project.parentChain.chainId === 8453, "Mainnet parent chain ID must be Base 8453.");
assert(project.chain.bridgeType === "op-stack-canonical", "Bridge type must be op-stack-canonical.");

assert(chain.nativeCurrency.symbol === "ETH", `${activeEnv} native currency must be ETH.`);
assert(chain.nativeCurrency.decimals === 18, `${activeEnv} native currency decimals must be 18.`);
assert(chain.bridgeType === "op-stack-canonical", `${activeEnv} bridge type must be op-stack-canonical.`);
assert(chain.parentChain.chainId === (production ? 8453 : chain.parentChain.chainId), "Mainnet parent chain must be Base.");

const expectedActiveParentChainId = production ? 8453 : testnet ? project.parentChain.testnetChainId : chain.parentChain.chainId;
const activeRollupChainId = rollup.l2_chain_id ?? rollup.chain_id ?? 0;

assert(chain.parentChain.chainId === expectedActiveParentChainId, `${activeEnv} parent chain ID is incorrect.`);
assert(genesis.config.chainId === chain.chainId, `${activeEnv} genesis chain ID must match chain config.`);
assert(activeRollupChainId === chain.chainId, `${activeEnv} rollup chain ID must match chain config.`);
assert(rollup.l1_chain_id === chain.parentChain.chainId, `${activeEnv} rollup parent chain ID must match chain config.`);

if (production || testnet) {
  assert(chain.chainId > 0, `${activeEnv} chain ID must be finalized.`);
  assert(chain.chainIdHex === `0x${chain.chainId.toString(16)}`, `${activeEnv} chainIdHex does not match chainId.`);
  assert(!isPlaceholderUrl(chain.rpcUrls.public), `${activeEnv} public RPC must not be a placeholder URL.`);
  assert(!isPlaceholderUrl(chain.rpcUrls.websocket), `${activeEnv} WebSocket RPC must not be a placeholder URL.`);
  assert(!isPlaceholderUrl(chain.explorerUrl), `${activeEnv} explorer URL must not be a placeholder URL.`);

  for (const [name, address] of [
    ["l1_system_config_address", rollup.l1_system_config_address],
    ["batch_inbox_address", rollup.batch_inbox_address],
    ["deposit_contract_address", rollup.deposit_contract_address]
  ] as const) {
    assert(isAddress(address), `${activeEnv} rollup ${name} must be a valid address.`);
    assert(!isZeroAddress(address), `${activeEnv} rollup ${name} must not be zero.`);
  }

  for (const [scope, contracts] of Object.entries(chainAddresses)) {
    for (const [name, address] of Object.entries(contracts)) {
      if (scope === "parentChain" && name === "l2OutputOracle" && !isZeroAddress(contracts.disputeGameFactory)) {
        continue;
      }
      assert(isAddress(address), `${activeEnv} chain address ${scope}.${name} must be valid.`);
      assert(!isZeroAddress(address), `${activeEnv} chain address ${scope}.${name} must not be zero.`);
    }
  }
}

assert(bridgeConfig.chainId === chain.chainId, `${activeEnv} bridge config chain ID must match chain config.`);
assert(bridgeConfig.parentChainId === chain.parentChain.chainId, `${activeEnv} bridge config parent chain ID must match chain config.`);
assert(chain.chainId === bridgeMetadata.chainId, `${activeEnv} chain ID and bridge metadata chain ID differ.`);
assert(
  bridgeMetadata.parentChainId === (testnet ? project.parentChain.testnetChainId : 8453),
  `Superbridge metadata parentChainId must match ${testnet ? "Base Sepolia 84532" : "Base 8453"}.`
);
assert(bridgeMetadata.nativeCurrency.symbol === "ETH", "Superbridge metadata native currency must be ETH.");
assert(bridgeMetadata.bridge.type === "op-stack-canonical", "Superbridge metadata bridge type must be op-stack-canonical.");
assert(
  bridgeAddresses.parentChain.chainId === (testnet ? project.parentChain.testnetChainId : 8453),
  `Bridge addresses parent chain must match ${testnet ? "Base Sepolia 84532" : "Base 8453"}.`
);
assert(bridgeAddresses.l3.chainId === bridgeMetadata.chainId, "Bridge address chain ID must match metadata.");

const bridgeAddressKeys = [
  "parentChainPortalAddress",
  "parentChainStandardBridgeAddress",
  "parentChainCrossDomainMessengerAddress",
  "l3StandardBridgeAddress",
  "l3CrossDomainMessengerAddress"
];

for (const key of bridgeAddressKeys) {
  const value = bridgeMetadata.bridge[key];
  assert(isAddress(value), `Bridge metadata ${key} must be a valid EVM address.`);
  if (production || testnet) {
    assert(!isZeroAddress(value), `Bridge metadata ${key} must not be zero in ${activeEnv}.`);
  }
}

for (const [scope, contracts] of [
  ["parentChain", bridgeAddresses.parentChain.contracts],
  ["l3", bridgeAddresses.l3.contracts]
] as const) {
  for (const [name, address] of Object.entries(contracts)) {
    assert(isAddress(address), `Bridge address ${scope}.${name} must be valid.`);
    if (production || testnet) {
      assert(!isZeroAddress(address), `Bridge address ${scope}.${name} must not be zero in ${activeEnv}.`);
    }
  }
}

if (production) {
  assert(process.env.MAINNET_ADMIN_MULTISIG && isAddress(process.env.MAINNET_ADMIN_MULTISIG), "MAINNET_ADMIN_MULTISIG must be set in production.");
  assert(!process.env.DEVNET_PRIVATE_KEY, "DEVNET_PRIVATE_KEY must not be set in production.");
  assert(!process.env.TESTNET_FAUCET_PRIVATE_KEY, "TESTNET_FAUCET_PRIVATE_KEY must not be set in production.");
  assert(!process.env.SYNTHETIC_MONITOR_PRIVATE_KEY, "SYNTHETIC_MONITOR_PRIVATE_KEY must not be set in production.");

  const icon = readFileSync("bridge/superbridge/assets/icon.png");
  const hasPngSignature = icon.length >= 8 && icon.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  assert(hasPngSignature, "Production icon.png must be a real PNG asset.");
}

const hashes = {
  CHAIN_CONFIG_HASH: sha256File(`chain/configs/${activeEnv}/chain.json`),
  ROLLUP_CONFIG_HASH: sha256File(`chain/configs/${activeEnv}/rollup.json`),
  BRIDGE_METADATA_HASH: sha256File(`${bridgeConfig.metadataOutput}/chain-metadata.json`),
  TOKEN_LIST_HASH: sha256File(`${bridgeConfig.metadataOutput}/token-list.json`)
};

console.log(JSON.stringify({ environment: activeEnv, production, hashes }, null, 2));
console.log("Vellum config validation passed.");
