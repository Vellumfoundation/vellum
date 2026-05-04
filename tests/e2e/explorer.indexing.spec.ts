import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, type Abi, type Address, type Hex } from "viem";
import { clients, hasLiveRpc, liveRequired, requireLiveRpc, rpcUrl } from "./lib/live";

const explorerUrl = (process.env.EXPLORER_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const explorerRequired = process.env.VELLUM_EXPLORER_REQUIRED === "true" ||
  process.env.EXPLORER_E2E_REQUIRED === "true" ||
  Boolean(process.env.EXPLORER_URL);
const indexingTimeoutMs = Number(process.env.EXPLORER_INDEXING_TIMEOUT_MS || "180000");
const pollIntervalMs = Number(process.env.EXPLORER_INDEXING_POLL_MS || "3000");

type ExplorerIndexingStatus = {
  finished_indexing: boolean;
  finished_indexing_blocks: boolean;
  indexed_blocks_ratio: string;
  indexed_internal_transactions_ratio: string | null;
};

type ExplorerAddressReference = {
  hash: string;
  is_contract?: boolean;
};

type ExplorerBlock = {
  hash: string;
  height: number;
  transactions_count: number;
};

type ExplorerTransaction = {
  hash: string;
  block_number: number;
  status: string;
  from?: ExplorerAddressReference;
  to?: ExplorerAddressReference | null;
  created_contract?: ExplorerAddressReference | null;
  token_transfers?: ExplorerTokenTransfer[];
  transaction_types?: string[];
};

type ExplorerAddress = ExplorerAddressReference & {
  creation_transaction_hash?: string | null;
  token?: ExplorerToken | null;
};

type ExplorerToken = {
  address_hash?: string;
  name: string;
  symbol: string;
  decimals: string;
  type: string;
  total_supply?: string;
};

type ExplorerTokenTransfer = {
  transaction_hash: string;
  from?: ExplorerAddressReference;
  to?: ExplorerAddressReference;
  token?: ExplorerToken;
  total?: { decimals: string; value: string };
};

type ExplorerPage<T> = {
  items: T[];
};

function tokenArtifact(): { abi: Abi; bytecode: { object: Hex } } {
  return JSON.parse(readFileSync("contracts/out/TestERC20.sol/TestERC20.json", "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
}

async function hasExplorerApi(): Promise<boolean> {
  try {
    const status = await explorerGet<ExplorerIndexingStatus>("/api/v2/main-page/indexing-status", 1500);
    return typeof status.finished_indexing_blocks === "boolean";
  } catch {
    return false;
  }
}

async function explorerGet<T>(path: string, timeoutMs = 5000): Promise<T> {
  const response = await fetch(`${explorerUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : undefined;

  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}: ${text}`);
  return body as T;
}

async function tryExplorerGet<T>(path: string): Promise<T | undefined> {
  try {
    return await explorerGet<T>(path);
  } catch {
    return undefined;
  }
}

async function waitForExplorer<T>(
  label: string,
  path: string,
  predicate: (body: T) => boolean
): Promise<T> {
  const startedAt = Date.now();
  let lastBody: T | undefined;

  while (Date.now() - startedAt < indexingTimeoutMs) {
    const body = await tryExplorerGet<T>(path);
    if (body) {
      lastBody = body;
      if (predicate(body)) return body;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  assert.fail(`${label} was not indexed by ${explorerUrl}${path}: ${JSON.stringify(lastBody)}`);
}

function sameHash(actual: string | undefined | null, expected: string): boolean {
  return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
}

function hasTokenTransfer(page: ExplorerPage<ExplorerTokenTransfer>, hash: Hex): boolean {
  return page.items.some((transfer) => sameHash(transfer.transaction_hash, hash));
}

describe("Explorer indexing", () => {
  it("indexes blocks, transactions, contract addresses, and ERC-20 token activity", async (t) => {
    if (!explorerRequired && !(await hasExplorerApi())) {
      t.skip("Blockscout explorer API not available");
      return;
    }
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    assert.equal(await hasExplorerApi(), true, `Blockscout explorer API unavailable at ${explorerUrl}`);
    await requireLiveRpc(rpcUrl);

    const artifact = tokenArtifact();
    const { account, publicClient, walletClient } = clients();
    const unique = Date.now().toString(36).toUpperCase();
    const symbol = `IDX${unique.slice(-6)}`;
    const recipient = "0x000000000000000000000000000000000000c0Fe" as Address;

    const deployHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      chain: null,
      args: [`Indexer Token ${unique}`, symbol, 18]
    });
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    assert.equal(deployReceipt.status, "success");
    assert.ok(deployReceipt.contractAddress, "token deployment should produce a contract address");

    const token = deployReceipt.contractAddress;
    const mintHash = await walletClient.writeContract({
      address: token,
      abi: artifact.abi,
      functionName: "mint",
      args: [account.address, parseUnits("42", 18)],
      chain: null
    });
    const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
    assert.equal(mintReceipt.status, "success");

    const transferHash = await walletClient.writeContract({
      address: token,
      abi: artifact.abi,
      functionName: "transfer",
      args: [recipient, parseUnits("7", 18)],
      chain: null
    });
    const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
    assert.equal(transferReceipt.status, "success");

    const block = await waitForExplorer<ExplorerBlock>(
      "deployment block",
      `/api/v2/blocks/${deployReceipt.blockNumber}`,
      (body) => body.height === Number(deployReceipt.blockNumber) && sameHash(body.hash, deployReceipt.blockHash)
    );
    assert.ok(block.transactions_count > 0, "indexed deployment block should include transactions");

    const deployment = await waitForExplorer<ExplorerTransaction>(
      "deployment transaction",
      `/api/v2/transactions/${deployHash}`,
      (body) => sameHash(body.hash, deployHash) &&
        body.status === "ok" &&
        body.block_number === Number(deployReceipt.blockNumber)
    );
    assert.ok(
      sameHash(deployment.created_contract?.hash, token) ||
        deployment.transaction_types?.includes("contract_creation"),
      "deployment transaction should be recognized as contract creation"
    );

    const contractAddress = await waitForExplorer<ExplorerAddress>(
      "contract address",
      `/api/v2/addresses/${token}`,
      (body) => sameHash(body.hash, token) &&
        (body.is_contract === true || sameHash(body.creation_transaction_hash, deployHash))
    );
    assert.equal(contractAddress.is_contract, true);

    const tokenInfo = await waitForExplorer<ExplorerToken>(
      "ERC-20 token",
      `/api/v2/tokens/${token}`,
      (body) => sameHash(body.address_hash, token) && body.symbol === symbol && body.type === "ERC-20"
    );
    assert.equal(tokenInfo.name, `Indexer Token ${unique}`);
    assert.equal(tokenInfo.decimals, "18");

    const transfer = await waitForExplorer<ExplorerTransaction>(
      "token transfer transaction",
      `/api/v2/transactions/${transferHash}`,
      (body) => sameHash(body.hash, transferHash) &&
        body.status === "ok" &&
        body.token_transfers?.some((item) => sameHash(item.token?.address_hash, token)) === true
    );
    assert.equal(transfer.block_number, Number(transferReceipt.blockNumber));

    await waitForExplorer<ExplorerPage<ExplorerTokenTransfer>>(
      "token transfer list",
      `/api/v2/tokens/${token}/transfers`,
      (body) => hasTokenTransfer(body, mintHash) && hasTokenTransfer(body, transferHash)
    );
  });
});
