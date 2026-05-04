import { existsSync } from "node:fs";
import { assert, readJson } from "./lib/common";

type ProjectConfig = {
  chain: { chainId: number };
  environments: Record<string, { chainId: number }>;
};

type ChainConfig = {
  chainId: number;
};

type GenesisConfig = {
  config: { chainId: number };
};

type RollupConfig = {
  chain_id?: number;
  l2_chain_id?: number;
};

type BridgeConfig = {
  chainId: number;
  metadataOutput: string;
};

type Environment = "devnet" | "testnet" | "mainnet";

const project = readJson<ProjectConfig>("config/project.json");
const metadata = readJson<{ chainId: number }>("bridge/superbridge/chain-metadata.json");
const bridgeAddresses = readJson<{ l3: { chainId: number } }>("bridge/superbridge/bridge-addresses.json");

const environments = ["devnet", "testnet", "mainnet"] as const;

const chainConfigs: Record<Environment, ChainConfig> = {
  devnet: readJson<ChainConfig>("chain/configs/devnet/chain.json"),
  testnet: readJson<ChainConfig>("chain/configs/testnet/chain.json"),
  mainnet: readJson<ChainConfig>("chain/configs/mainnet/chain.json")
};

const genesisConfigs: Record<Environment, GenesisConfig> = {
  devnet: readJson<GenesisConfig>("chain/configs/devnet/genesis.json"),
  testnet: readJson<GenesisConfig>("chain/configs/testnet/genesis.json"),
  mainnet: readJson<GenesisConfig>("chain/configs/mainnet/genesis.json")
};

const rollupConfigs: Record<Environment, RollupConfig> = {
  devnet: readJson<RollupConfig>("chain/configs/devnet/rollup.json"),
  testnet: readJson<RollupConfig>("chain/configs/testnet/rollup.json"),
  mainnet: readJson<RollupConfig>("chain/configs/mainnet/rollup.json")
};

const bridgeConfigs: Record<Environment, BridgeConfig> = {
  devnet: readJson<BridgeConfig>("bridge/configs/devnet.bridge.json"),
  testnet: readJson<BridgeConfig>("bridge/configs/testnet.bridge.json"),
  mainnet: readJson<BridgeConfig>("bridge/configs/mainnet.bridge.json")
};

const activeIds = [
  ["config/project.json", project.chain.chainId],
  ["bridge/superbridge/chain-metadata.json", metadata.chainId],
  ["bridge/superbridge/bridge-addresses.json", bridgeAddresses.l3.chainId],
  ["chain/configs/devnet/chain.json", chainConfigs.devnet.chainId]
] as const;

for (const [file, chainId] of activeIds) {
  assert(chainId > 0, `${file} has missing chain ID.`);
  assert(chainId === project.chain.chainId, `${file} chain ID ${chainId} does not match project chain ID ${project.chain.chainId}.`);
}

function rollupChainId(config: RollupConfig): number {
  return config.l2_chain_id ?? config.chain_id ?? 0;
}

function existingBridgePackageChainIds(env: Environment): Array<readonly [string, number]> {
  if (bridgeConfigs[env].chainId === 0 || chainConfigs[env].chainId === 0) {
    return [];
  }

  const output = bridgeConfigs[env].metadataOutput;
  const metadataPath = `${output}/chain-metadata.json`;
  const addressesPath = `${output}/bridge-addresses.json`;
  const results: Array<readonly [string, number]> = [];

  if (existsSync(metadataPath)) {
    results.push([metadataPath, readJson<{ chainId: number }>(metadataPath).chainId]);
  }

  if (existsSync(addressesPath)) {
    results.push([addressesPath, readJson<{ l3: { chainId: number } }>(addressesPath).l3.chainId]);
  }

  return results;
}

const environmentChainIds = new Map<Environment, number>();

for (const env of environments) {
  const candidates = [
    [`config/project.json environments.${env}`, project.environments[env]?.chainId ?? 0],
    [`chain/configs/${env}/chain.json`, chainConfigs[env].chainId],
    [`chain/configs/${env}/genesis.json`, genesisConfigs[env].config.chainId],
    [`chain/configs/${env}/rollup.json`, rollupChainId(rollupConfigs[env])],
    [`bridge/configs/${env}.bridge.json`, bridgeConfigs[env].chainId],
    ...existingBridgePackageChainIds(env)
  ] as const;
  const nonzeroCandidates = candidates.filter(([, chainId]) => chainId > 0);

  if (nonzeroCandidates.length === 0) {
    console.warn(`${env} chain ID is still TBD.`);
    continue;
  }

  const selectedChainId = nonzeroCandidates[0][1];
  for (const [file, chainId] of nonzeroCandidates) {
    assert(chainId === selectedChainId, `${env} chain ID mismatch: ${file} has ${chainId}, expected ${selectedChainId}.`);
  }

  environmentChainIds.set(env, selectedChainId);
}

const seenEnvironmentIds = new Map<number, Environment>();
for (const [env, chainId] of environmentChainIds) {
  const existingEnv = seenEnvironmentIds.get(chainId);
  assert(!existingEnv, `${env} chain ID ${chainId} collides with ${existingEnv} chain ID.`);
  seenEnvironmentIds.set(chainId, env);
}

async function fetchChainlist(): Promise<Array<{ chainId: number; name: string }>> {
  const response = await fetch("https://chainid.network/chains.json", { signal: AbortSignal.timeout(10000) });
  assert(response.ok, `Failed to fetch chainid.network list: HTTP ${response.status}.`);
  return await response.json() as Array<{ chainId: number; name: string }>;
}

async function assertNoRemoteConflict(chainId: number, label: string, chains: Array<{ chainId: number; name: string }>): Promise<void> {
  const conflict = chains.find((chain) => chain.chainId === chainId);
  assert(!conflict, `${label} chain ID ${chainId} conflicts with ${conflict?.name}.`);
}

function formatChainId(chainId: number): string {
  return `${chainId} (0x${chainId.toString(16)})`;
}

async function main(): Promise<void> {
  if (process.env.CHECK_CHAINLIST === "1") {
    const chains = await fetchChainlist();
    const idsToCheck = new Map<number, string>([[project.chain.chainId, "active project"]]);

    for (const [env, chainId] of environmentChainIds) {
      idsToCheck.set(chainId, env);
    }

    for (const [chainId, label] of idsToCheck) {
      await assertNoRemoteConflict(chainId, label, chains);
      console.log(`Remote chainlist conflict check passed for ${label} chain ID ${formatChainId(chainId)}.`);
    }
  } else {
    console.log("Skipping remote chainlist check. Set CHECK_CHAINLIST=1 to enable it.");
  }

  for (const [env, chainId] of environmentChainIds) {
    console.log(`${env} chain ID ${formatChainId(chainId)} is locally consistent.`);
  }

  console.log(`Active chain ID ${formatChainId(project.chain.chainId)} is consistent across local active config.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
