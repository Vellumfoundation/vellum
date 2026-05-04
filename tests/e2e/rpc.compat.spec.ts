import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  numberToHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import WebSocket from "ws";
import { erc20Abi } from "./lib/bridge";
import {
  fundedDevnetPrivateKeys,
  hasLiveRpc,
  liveRequired,
  requireLiveRpc,
  rpcUrl,
  wsRpcUrl
} from "./lib/live";

const chainId = 90103;
const wethAddress: Address = "0x4200000000000000000000000000000000000006";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

type JsonRpcSubscription<T> = {
  jsonrpc: "2.0";
  method: "eth_subscription";
  params: { subscription: string; result: T };
};

type RpcBlock = {
  number: Hex;
  hash: Hex;
  transactions: Hex[];
};

type RpcTransaction = {
  hash: Hex;
  blockHash: Hex | null;
  blockNumber: Hex | null;
  from: Address;
  to: Address | null;
};

type RpcReceipt = {
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  status: Hex;
  logs: RpcLog[];
};

type RpcLog = {
  address: Address;
  blockNumber: Hex;
  transactionHash: Hex;
  topics: Hex[];
  data: Hex;
};

type FeeHistory = {
  oldestBlock: Hex;
  baseFeePerGas: Hex[];
  gasUsedRatio: number[];
};

function assertQuantity(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string") assert.fail(`${label} must be a hex quantity`);
  assert.match(value, /^0x[0-9a-fA-F]+$/, `${label} must be a hex quantity`);
}

function assertHash(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string") assert.fail(`${label} must be a hash`);
  assert.match(value, /^0x[0-9a-fA-F]{64}$/, `${label} must be a hash`);
}

function assertAddress(value: unknown, label: string): asserts value is Address {
  if (typeof value !== "string") assert.fail(`${label} must be an address`);
  assert.match(value, /^0x[0-9a-fA-F]{40}$/, `${label} must be an address`);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function tokenArtifact(): { abi: Abi; bytecode: { object: Hex } } {
  return JSON.parse(readFileSync("contracts/out/TestERC20.sol/TestERC20.json", "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const body = await response.json() as JsonRpcResponse<T>;

  assert.equal(response.ok, true, `${method} HTTP request failed`);
  assert.equal(body.error, undefined, body.error?.message);
  assert.ok("result" in body, `${method} response should include result`);
  return body.result as T;
}

async function waitForRpcReceipt(hash: Hex, timeoutMs = 60_000): Promise<RpcReceipt> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  assert.fail(`timed out waiting for receipt ${hash}`);
}

async function deployToken(privateKey: Hex, name: string, symbol: string) {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
  const artifact = tokenArtifact();
  const gasPrice = await boostedGasPrice(publicClient);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    chain: null,
    gasPrice,
    args: [name, symbol, 18]
  });
  const receipt = await withTimeout(publicClient.waitForTransactionReceipt({ hash }), 60_000, `${symbol} deployment`);

  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress, "token deployment should produce a contract address");
  return { account, publicClient, walletClient, token: receipt.contractAddress };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function boostedGasPrice(publicClient: PublicClient): Promise<bigint> {
  return (await publicClient.getGasPrice()) + 1_000_000_000n;
}

function parseWebSocketMessage<T>(data: WebSocket.RawData): JsonRpcResponse<T> | JsonRpcSubscription<T> {
  const text = Array.isArray(data) ? Buffer.concat(data).toString("utf8") : data.toString();
  return JSON.parse(text) as JsonRpcResponse<T> | JsonRpcSubscription<T>;
}

async function openJsonRpcWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await new Promise<WebSocket>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`WebSocket connection to ${url} timed out`)), 5_000);
      socket.once("open", () => resolve(socket));
      socket.once("error", reject);
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function wsRequest<T>(socket: WebSocket, id: number, method: string, params: unknown[] = []): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  return await new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (data: WebSocket.RawData) => {
      const message = parseWebSocketMessage<T>(data);
      if (!("id" in message) || message.id !== id) return;

      cleanup();
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve(message.result as T);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${method} WebSocket request timed out`));
    }, 10_000);
    socket.on("message", onMessage);
    socket.on("error", onError);
    socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

async function waitForSubscription<T>(
  socket: WebSocket,
  subscriptionId: string,
  label: string,
  predicate: (result: T) => boolean = () => true
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  return await new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (data: WebSocket.RawData) => {
      const message = parseWebSocketMessage<T>(data);
      if (!("method" in message) || message.method !== "eth_subscription") return;
      if (message.params.subscription !== subscriptionId) return;
      if (!predicate(message.params.result)) return;

      cleanup();
      resolve(message.params.result);
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} subscription timed out`));
    }, 20_000);
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

describe("RPC compatibility", () => {
  it("supports wallet, deployer, and indexer HTTP JSON-RPC methods", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);

    const account = privateKeyToAccount(fundedDevnetPrivateKeys.account5);
    const chainIdHex = await rpc<Hex>("eth_chainId");
    assert.equal(Number(BigInt(chainIdHex)), chainId);

    const netVersion = await rpc<string>("net_version");
    assert.equal(Number(netVersion), chainId);

    const clientVersion = await rpc<string>("web3_clientVersion");
    assert.match(clientVersion, /geth|op-geth/i);

    const latestBlockNumber = await rpc<Hex>("eth_blockNumber");
    assertQuantity(latestBlockNumber, "latest block number");

    const latestBlock = await rpc<RpcBlock>("eth_getBlockByNumber", ["latest", false]);
    assertQuantity(latestBlock.number, "latest block.number");
    assertHash(latestBlock.hash, "latest block.hash");
    assert.ok(Array.isArray(latestBlock.transactions), "latest block transactions should be an array");

    const blockByHash = await rpc<RpcBlock>("eth_getBlockByHash", [latestBlock.hash, false]);
    assert.equal(blockByHash.hash, latestBlock.hash);

    assertQuantity(await rpc<Hex>("eth_getBalance", [account.address, "latest"]), "account balance");
    assertQuantity(await rpc<Hex>("eth_getTransactionCount", [account.address, "latest"]), "account nonce");
    assertQuantity(await rpc<Hex>("eth_gasPrice"), "gas price");
    assertQuantity(
      await rpc<Hex>("eth_estimateGas", [{ from: account.address, to: account.address, value: "0x1" }]),
      "estimated gas"
    );

    const feeHistory = await rpc<FeeHistory>("eth_feeHistory", ["0x1", "latest", []]);
    assertQuantity(feeHistory.oldestBlock, "feeHistory.oldestBlock");
    assert.ok(feeHistory.baseFeePerGas.length >= 1, "feeHistory should include baseFeePerGas");
    assert.ok(feeHistory.gasUsedRatio.length >= 1, "feeHistory should include gasUsedRatio");

    const wethCode = await rpc<Hex>("eth_getCode", [wethAddress, "latest"]);
    assert.match(wethCode, /^0x[0-9a-fA-F]+$/);
    assert.notEqual(wethCode, "0x");

    const wethStorage = await rpc<Hex>("eth_getStorageAt", [wethAddress, "0x0", "latest"]);
    assert.match(wethStorage, /^0x[0-9a-fA-F]{64}$/);

    const wethDecimals = await rpc<Hex>("eth_call", [{ to: wethAddress, data: "0x313ce567" }, "latest"]);
    assert.equal(BigInt(wethDecimals), 18n);

    const syncing = await rpc<boolean | Record<string, Hex>>("eth_syncing");
    assert.ok(syncing === false || typeof syncing === "object", "eth_syncing should return false or sync status");

    assertQuantity(await rpc<Hex>("net_peerCount"), "net peer count");
  });

  it("supports raw transaction submission, receipts, transaction lookup, and event logs", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const account = privateKeyToAccount(fundedDevnetPrivateKeys.account6);
    const nonce = await publicClient.getTransactionCount({ address: account.address });
    const gasPrice = await boostedGasPrice(publicClient);
    const rawTransaction = await account.signTransaction({
      chainId,
      gas: 21_000n,
      gasPrice,
      nonce,
      to: account.address,
      value: 1n
    });

    const transactionHash = await rpc<Hex>("eth_sendRawTransaction", [rawTransaction]);
    assertHash(transactionHash, "raw transaction hash");

    const receipt = await waitForRpcReceipt(transactionHash);
    assert.equal(receipt.transactionHash, transactionHash);
    assert.equal(BigInt(receipt.status), 1n);

    const transaction = await rpc<RpcTransaction>("eth_getTransactionByHash", [transactionHash]);
    assert.equal(transaction.hash, transactionHash);
    assert.equal(lower(transaction.from), lower(account.address));
    assert.equal(lower(transaction.to || ""), lower(account.address));

    const block = await rpc<RpcBlock>("eth_getBlockByHash", [receipt.blockHash, false]);
    assert.equal(block.hash, receipt.blockHash);
    assert.equal(block.number, receipt.blockNumber);

    const { account: tokenOwner, publicClient: tokenPublicClient, walletClient, token } = await deployToken(
      fundedDevnetPrivateKeys.account7,
      "RPC Log Token",
      "RLT"
    );
    const mintHash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "mint",
      args: [tokenOwner.address, 1n],
      gasPrice: await boostedGasPrice(tokenPublicClient),
      chain: null
    });
    const mintReceipt = await withTimeout(tokenPublicClient.waitForTransactionReceipt({ hash: mintHash }), 60_000, "RLT mint receipt");
    assert.equal(mintReceipt.status, "success");

    const logs = await rpc<RpcLog[]>("eth_getLogs", [{
      address: token,
      fromBlock: numberToHex(mintReceipt.blockNumber),
      toBlock: numberToHex(mintReceipt.blockNumber),
      topics: [transferTopic]
    }]);
    assert.ok(logs.some((log) => lower(log.address) === lower(token) && log.transactionHash === mintHash));
  });

  it("supports WebSocket newHeads and logs subscriptions", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);

    let socket: WebSocket | undefined;
    let nextRequestId = 1;
    let headsSubscriptionId: string | undefined;
    let logsSubscriptionId: string | undefined;

    try {
      try {
        socket = await openJsonRpcWebSocket(wsRpcUrl);
        const wsChainId = await wsRequest<Hex>(socket, nextRequestId++, "eth_chainId");
        assert.equal(Number(BigInt(wsChainId)), chainId);
      } catch (error) {
        if (!liveRequired) {
          t.skip(`live devnet WebSocket RPC not available at ${wsRpcUrl}`);
          return;
        }
        throw error;
      }

      headsSubscriptionId = await wsRequest<string>(socket, nextRequestId++, "eth_subscribe", ["newHeads"]);
      const head = await waitForSubscription<{ number: Hex }>(socket, headsSubscriptionId, "newHeads");
      assertQuantity(head.number, "newHeads block number");
      assert.ok(BigInt(head.number) > 0n, "newHeads subscription should receive a block number");

      const { account, publicClient, walletClient, token } = await deployToken(
        fundedDevnetPrivateKeys.account4,
        "RPC WebSocket Token",
        "RWT"
      );
      logsSubscriptionId = await wsRequest<string>(socket, nextRequestId++, "eth_subscribe", [
        "logs",
        { address: token, topics: [transferTopic] }
      ]);
      const logPromise = waitForSubscription<RpcLog>(
        socket,
        logsSubscriptionId,
        "logs",
        (log) => lower(log.address) === lower(token)
      );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const mintHash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "mint",
        args: [account.address, 2n],
        gasPrice: await boostedGasPrice(publicClient),
        chain: null
      });
      await withTimeout(publicClient.waitForTransactionReceipt({ hash: mintHash }), 60_000, "RWT mint receipt");
      assertHash(mintHash, "WebSocket log trigger transaction hash");

      const log = await logPromise;
      assert.equal(lower(log.address), lower(token));
    } finally {
      if (socket && logsSubscriptionId) {
        await wsRequest<boolean>(socket, nextRequestId++, "eth_unsubscribe", [logsSubscriptionId]).catch(() => false);
      }
      if (socket && headsSubscriptionId) {
        await wsRequest<boolean>(socket, nextRequestId++, "eth_unsubscribe", [headsSubscriptionId]).catch(() => false);
      }
      socket?.terminate();
    }
  });
});
