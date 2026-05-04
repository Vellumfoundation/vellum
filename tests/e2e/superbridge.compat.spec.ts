import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { devnetBridgeAddresses } from "./lib/bridge";
import { hasLiveRpc, l1RpcUrl, liveRequired, requireLiveRpc, rpcUrl } from "./lib/live";

const zeroAddress = "0x0000000000000000000000000000000000000000";

type BridgeMetadata = {
  name: string;
  slug: string;
  chainId: number;
  parentChainId: number;
  parentChainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { public: string; websocket: string };
  explorers: Array<{ name: string; url: string; standard: string }>;
  bridge: {
    type: string;
    recommendedFrontend: string;
    parentChainPortalAddress: string;
    parentChainStandardBridgeAddress: string;
    parentChainCrossDomainMessengerAddress: string;
    l3StandardBridgeAddress: string;
    l3CrossDomainMessengerAddress: string;
    withdrawalChallengePeriodSeconds: number;
    supportsForcedWithdrawals: boolean;
    supportsEthDeposits: boolean;
    supportsErc20Deposits: boolean;
  };
  status: { homepage: string; health: string };
  brand: { icon: string; logo: string };
};

type BridgeAddresses = {
  parentChain: {
    name: string;
    chainId: number;
    contracts: Record<string, string>;
  };
  l3: {
    name: string;
    chainId: number;
    contracts: Record<string, string>;
  };
};

type Token = {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  extensions?: Record<string, unknown>;
};

type TokenList = {
  name: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  tokens: Token[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertAddress(value: unknown, label: string): asserts value is Address {
  if (typeof value !== "string") assert.fail(`${label} must be a string`);
  assert.match(value, /^0x[a-fA-F0-9]{40}$/, `${label} must be an EVM address`);
}

function assertUrl(value: string, label: string): void {
  assert.doesNotThrow(() => new URL(value), `${label} must be a URL`);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function extensionAddress(token: Token, key: string): string | undefined {
  const value = token.extensions?.[key];
  return typeof value === "string" ? value : undefined;
}

async function assertHasCode(publicClient: PublicClient, address: string, label: string): Promise<void> {
  assertAddress(address, label);
  if (lower(address) === zeroAddress) return;

  const bytecode = await publicClient.getBytecode({ address });
  assert.ok(bytecode && bytecode !== "0x", `${label} should have deployed bytecode`);
}

describe("Superbridge compatibility", () => {
  it("validates the handoff package with the bundled validators", () => {
    assert.doesNotThrow(() => {
      execFileSync("pnpm", ["bridge:validate"], {
        cwd: process.cwd(),
        env: { ...process.env, PROJECT_ENV: process.env.PROJECT_ENV || "development" },
        stdio: "pipe"
      });
    });
  });

  it("keeps chain metadata, bridge addresses, and notes internally consistent", () => {
    const metadata = readJson<BridgeMetadata>("bridge/superbridge/chain-metadata.json");
    const addresses = readJson<BridgeAddresses>("bridge/superbridge/bridge-addresses.json");
    const notes = readFileSync("bridge/superbridge/integration-notes.md", "utf8").toLowerCase();

    assert.equal(metadata.name, "Vellum");
    assert.equal(metadata.slug, "vellum");
    assert.equal(metadata.parentChainId, 8453);
    assert.equal(metadata.parentChainName, "Base");
    assert.equal(metadata.nativeCurrency.name, "Ether");
    assert.equal(metadata.nativeCurrency.symbol, "ETH");
    assert.equal(metadata.nativeCurrency.decimals, 18);
    assert.equal(metadata.bridge.type, "op-stack-canonical");
    assert.equal(metadata.bridge.recommendedFrontend, "Superbridge");
    assert.equal(metadata.bridge.supportsEthDeposits, true);
    assert.equal(metadata.bridge.supportsErc20Deposits, true);
    assert.equal(metadata.bridge.supportsForcedWithdrawals, true);
    assertUrl(metadata.rpcUrls.public, "public RPC URL");
    assertUrl(metadata.rpcUrls.websocket, "WebSocket RPC URL");
    assertUrl(metadata.explorers[0]?.url, "explorer URL");
    assertUrl(metadata.status.homepage, "status homepage URL");
    assertUrl(metadata.status.health, "status health URL");
    assertUrl(metadata.brand.icon, "brand icon URL");
    assertUrl(metadata.brand.logo, "brand logo URL");

    assert.equal(addresses.parentChain.chainId, metadata.parentChainId);
    assert.equal(addresses.l3.chainId, metadata.chainId);
    assert.equal(addresses.parentChain.name, "Base");
    assert.equal(addresses.l3.name, metadata.name);

    const mirroredAddresses = [
      [metadata.bridge.parentChainPortalAddress, addresses.parentChain.contracts.portal, "parent portal"],
      [
        metadata.bridge.parentChainStandardBridgeAddress,
        addresses.parentChain.contracts.standardBridge,
        "parent standard bridge"
      ],
      [
        metadata.bridge.parentChainCrossDomainMessengerAddress,
        addresses.parentChain.contracts.crossDomainMessenger,
        "parent cross-domain messenger"
      ],
      [metadata.bridge.l3StandardBridgeAddress, addresses.l3.contracts.standardBridge, "L3 standard bridge"],
      [
        metadata.bridge.l3CrossDomainMessengerAddress,
        addresses.l3.contracts.crossDomainMessenger,
        "L3 cross-domain messenger"
      ]
    ] as const;

    for (const [metadataAddress, packageAddress, label] of mirroredAddresses) {
      assertAddress(metadataAddress, `${label} metadata address`);
      assertAddress(packageAddress, `${label} package address`);
      assert.equal(lower(metadataAddress), lower(packageAddress), `${label} metadata should mirror address package`);
    }

    for (const [scope, contracts] of [
      ["parent chain", addresses.parentChain.contracts],
      ["L3", addresses.l3.contracts]
    ] as const) {
      for (const [name, address] of Object.entries(contracts)) {
        assertAddress(address, `${scope} ${name}`);
      }
    }

    assert.equal(lower(addresses.l3.contracts.weth), "0x4200000000000000000000000000000000000006");

    for (const phrase of [
      "chain-metadata.json",
      "bridge-addresses.json",
      "token-list.json",
      "withdrawal challenge period",
      "eth deposit",
      "eth withdrawal",
      "erc-20 deposit",
      "erc-20 withdrawal",
      "security contact",
      "incident contact",
      "no custom behavior"
    ]) {
      assert.ok(notes.includes(phrase), `integration notes should mention ${phrase}`);
    }
  });

  it("validates native ETH token entries and standard ERC-20 mapping shape", () => {
    const metadata = readJson<BridgeMetadata>("bridge/superbridge/chain-metadata.json");
    const list = readJson<TokenList>("bridge/superbridge/token-list.json");

    assert.equal(list.name, "Vellum Token List");
    assert.ok(!Number.isNaN(Date.parse(list.timestamp)), "token list timestamp must be parseable");
    assert.equal(Number.isInteger(list.version.major), true);
    assert.equal(Number.isInteger(list.version.minor), true);
    assert.equal(Number.isInteger(list.version.patch), true);
    assert.ok(list.tokens.length >= 2, "token list should include parent and L3 native ETH");

    const parentEth = list.tokens.find((token) => token.chainId === metadata.parentChainId && token.symbol === "ETH");
    const l3Eth = list.tokens.find((token) => token.chainId === metadata.chainId && token.symbol === "ETH");
    assert.ok(parentEth, "token list must include parent-chain native ETH");
    assert.ok(l3Eth, "token list must include L3 native ETH");
    assert.equal(parentEth.name, "Ether");
    assert.equal(l3Eth.name, "Ether");
    assert.equal(parentEth.decimals, 18);
    assert.equal(l3Eth.decimals, 18);
    assert.equal(parentEth.extensions?.native, true);
    assert.equal(l3Eth.extensions?.native, true);
    assert.equal(l3Eth.extensions?.parentChainId, metadata.parentChainId);

    for (const token of list.tokens) {
      assert.equal(Number.isInteger(token.chainId), true, `${token.symbol} chainId must be an integer`);
      assertAddress(token.address, `${token.symbol} token address`);
      assert.ok(token.name, "token name is required");
      assert.ok(token.symbol, "token symbol is required");
      assert.ok(Number.isInteger(token.decimals), `${token.symbol} decimals must be an integer`);
      if (token.logoURI) assertUrl(token.logoURI, `${token.symbol} logo URI`);
    }

    const parentMappedTokens = list.tokens.filter((token) => extensionAddress(token, "l3Address"));
    for (const parentToken of parentMappedTokens) {
      const l3Address = extensionAddress(parentToken, "l3Address");
      assertAddress(l3Address, `${parentToken.symbol} L3 mapped address`);
      assert.equal(parentToken.extensions?.bridge, "standard");

      const l3Token = list.tokens.find(
        (token) => token.chainId === metadata.chainId && lower(token.address) === lower(l3Address)
      );
      assert.ok(l3Token, `${parentToken.symbol} should include a reciprocal L3 token entry`);
      assert.equal(l3Token.extensions?.parentChainId, metadata.parentChainId);
      assert.equal(lower(extensionAddress(l3Token, "parentAddress") || ""), lower(parentToken.address));
      assert.equal(l3Token.extensions?.bridge, "standard");
    }
  });

  it("matches the live devnet chain and deployed canonical bridge contracts", async (t) => {
    if (!liveRequired && (!(await hasLiveRpc(l1RpcUrl)) || !(await hasLiveRpc(rpcUrl)))) {
      t.skip("live devnet L1/L3 RPC not available");
      return;
    }

    await requireLiveRpc(l1RpcUrl);
    await requireLiveRpc(rpcUrl);

    const metadata = readJson<BridgeMetadata>("bridge/superbridge/chain-metadata.json");
    const addresses = devnetBridgeAddresses();
    const l1PublicClient = createPublicClient({ transport: http(l1RpcUrl) });
    const l3PublicClient = createPublicClient({ transport: http(rpcUrl) });

    assert.equal(await l3PublicClient.getChainId(), metadata.chainId);

    await Promise.all([
      assertHasCode(l1PublicClient, addresses.parentChain.portal, "devnet parent portal"),
      assertHasCode(l1PublicClient, addresses.parentChain.standardBridge, "devnet parent standard bridge"),
      assertHasCode(l1PublicClient, addresses.parentChain.crossDomainMessenger, "devnet parent messenger"),
      assertHasCode(l1PublicClient, addresses.parentChain.systemConfig, "devnet parent system config"),
      assertHasCode(l1PublicClient, addresses.parentChain.disputeGameFactory, "devnet dispute game factory"),
      assertHasCode(l3PublicClient, addresses.l3.standardBridge, "devnet L3 standard bridge"),
      assertHasCode(l3PublicClient, addresses.l3.crossDomainMessenger, "devnet L3 messenger"),
      assertHasCode(l3PublicClient, addresses.l3.weth, "devnet L3 WETH")
    ]);
  });
});
