import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { fundedDevnetPrivateKeys, hasLiveRpc, liveRequired, requireLiveRpc, rpcUrl } from "./lib/live";

type CommandResult = {
  stdout: string;
  stderr: string;
};

type ExampleTransferResult = {
  tool: "viem" | "ethers";
  hash: Hex;
  status: "success" | "reverted";
  blockNumber: string | number;
  to: Address;
  valueWei: string;
};

type HardhatDeployResult = {
  tool: "hardhat";
  contract: "Counter";
  address: Address;
  transactionHash: Hex;
  blockNumber: number;
};

type FoundryDeployResult = {
  deployedTo?: Address;
  address?: Address;
  contractAddress?: Address;
  transactionHash?: Hex;
};

const chainId = Number(process.env.VELLUM_CHAIN_ID || "90103");
const baseEnv = {
  VELLUM_RPC_URL: rpcUrl,
  VELLUM_CHAIN_ID: String(chainId),
  TRANSFER_AMOUNT_ETH: "0.000001"
};
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...baseEnv, ...options.env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let timeout: NodeJS.Timeout | undefined;

  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  return await new Promise<CommandResult>((resolve, reject) => {
    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${options.timeoutMs || 120_000}ms`));
    }, options.timeoutMs || 120_000);

    child.once("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      if (timeout) clearTimeout(timeout);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      reject(new Error([
        `${command} ${args.join(" ")} exited with ${code}`,
        result.stdout.trim(),
        result.stderr.trim()
      ].filter(Boolean).join("\n")));
    });
  });
}

async function hasCommand(command: string, args: string[]): Promise<boolean> {
  try {
    await runCommand(command, args, { timeoutMs: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function parseLastJsonLine<T>(result: CommandResult, label: string): T {
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines.reverse()) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    return JSON.parse(line) as T;
  }

  const combined = `${result.stdout}\n${result.stderr}`;
  const start = combined.indexOf("{");
  const end = combined.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(combined.slice(start, end + 1)) as T;
  }

  assert.fail(`${label} did not print a JSON result. stdout=${result.stdout} stderr=${result.stderr}`);
}

function assertHash(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string") assert.fail(`${label} must be a hash`);
  assert.match(value, hashPattern, `${label} must be a hash`);
}

function assertAddress(value: unknown, label: string): asserts value is Address {
  if (typeof value !== "string") assert.fail(`${label} must be an address`);
  assert.match(value, addressPattern, `${label} must be an address`);
}

describe("SDK developer examples", () => {
  it("typechecks SDK metadata and Wagmi integration", async () => {
    await runCommand("pnpm", ["--filter", "@vellum/sdk", "typecheck"]);
    await runCommand("pnpm", ["--filter", "@vellum/example-wagmi-app", "typecheck"]);

    const metadata = parseLastJsonLine<{
      id: number;
      name: string;
      nativeSymbol: string;
      rpcUrl: string;
      addChainId: string;
    }>(await runCommand("pnpm", [
      "exec",
      "tsx",
      "-e",
      "import { vellum } from './sdk/src/viem.ts'; import { addVellumChainPayload } from './sdk/src/chains.ts'; console.log(JSON.stringify({ id: vellum.id, name: vellum.name, nativeSymbol: vellum.nativeCurrency.symbol, rpcUrl: vellum.rpcUrls.default.http[0], addChainId: addVellumChainPayload.chainId }));"
    ]), "SDK metadata");

    assert.equal(metadata.id, chainId);
    assert.equal(metadata.name, "Vellum");
    assert.equal(metadata.nativeSymbol, "ETH");
    assert.equal(metadata.rpcUrl, rpcUrl);
    assert.equal(metadata.addChainId, `0x${chainId.toString(16)}`);
  });

  it("runs viem and ethers ETH transfer examples on the L3 devnet", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const cases = [
      {
        tool: "viem",
        args: ["exec", "tsx", "sdk/examples/viem-transfer.ts"],
        privateKey: fundedDevnetPrivateKeys.account3,
        recipient: "0x000000000000000000000000000000000000e501"
      },
      {
        tool: "ethers",
        args: ["exec", "tsx", "sdk/examples/ethers-transfer.ts"],
        privateKey: fundedDevnetPrivateKeys.account6,
        recipient: "0x000000000000000000000000000000000000e602"
      }
    ] as const;

    for (const item of cases) {
      const result = parseLastJsonLine<ExampleTransferResult>(
        await runCommand("pnpm", item.args, {
          env: {
            PRIVATE_KEY: item.privateKey,
            RECIPIENT_ADDRESS: item.recipient
          }
        }),
        `${item.tool} transfer`
      );

      assert.equal(result.tool, item.tool);
      assertHash(result.hash, `${item.tool} transaction hash`);
      assert.equal(result.status, "success");
      assert.equal(result.to.toLowerCase(), item.recipient.toLowerCase());
      assert.equal(result.valueWei, "1000000000000");

      const receipt = await publicClient.getTransactionReceipt({ hash: result.hash });
      assert.equal(receipt.status, "success");
    }
  });

  it("deploys Counter from the Hardhat and Foundry examples", async (t) => {
    if (!liveRequired && !(await hasLiveRpc(rpcUrl))) {
      t.skip("live devnet RPC not available");
      return;
    }

    await requireLiveRpc(rpcUrl);
    const publicClient = createPublicClient({ transport: http(rpcUrl) });

    const hardhat = parseLastJsonLine<HardhatDeployResult>(
      await runCommand("pnpm", ["--filter", "@vellum/example-deploy-hardhat", "run", "deploy"], {
        env: { PRIVATE_KEY: fundedDevnetPrivateKeys.account4 },
        timeoutMs: 180_000
      }),
      "Hardhat deploy"
    );
    assert.equal(hardhat.tool, "hardhat");
    assert.equal(hardhat.contract, "Counter");
    assertAddress(hardhat.address, "Hardhat deployment address");
    assertHash(hardhat.transactionHash, "Hardhat deployment transaction hash");
    assert.notEqual(await publicClient.getCode({ address: hardhat.address }), "0x");

    if (!(await hasCommand("forge", ["--version"]))) {
      t.skip("forge CLI not available");
      return;
    }

    const foundry = parseLastJsonLine<FoundryDeployResult>(
      await runCommand("forge", [
        "create",
        "src/Counter.sol:Counter",
        "--rpc-url",
        rpcUrl,
        "--private-key",
        fundedDevnetPrivateKeys.account7,
        "--broadcast",
        "--legacy",
        "--gas-price",
        "1000000000",
        "--json"
      ], {
        cwd: "sdk/examples/deploy-foundry",
        timeoutMs: 180_000
      }),
      "Foundry deploy"
    );
    const foundryAddress = foundry.deployedTo || foundry.address || foundry.contractAddress;

    assertAddress(foundryAddress, "Foundry deployment address");
    assert.notEqual(await publicClient.getCode({ address: foundryAddress }), "0x");
    if (foundry.transactionHash) assertHash(foundry.transactionHash, "Foundry deployment transaction hash");
  });
});
