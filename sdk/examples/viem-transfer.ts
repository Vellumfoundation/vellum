import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { vellum } from "../src/viem";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }

  const rpcUrl = process.env.VELLUM_RPC_URL || vellum.rpcUrls.default.http[0];
  const recipient = (process.env.RECIPIENT_ADDRESS ||
    "0x000000000000000000000000000000000000dEaD") as `0x${string}`;
  const value = parseEther(process.env.TRANSFER_AMOUNT_ETH || "0.000001");
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl)
  });
  const publicClient = createPublicClient({
    chain: vellum,
    transport: http(rpcUrl)
  });
  const gasPrice = await publicClient.getGasPrice() + 1_000_000_000n;

  const hash = await walletClient.sendTransaction({
    chain: null,
    to: recipient,
    value,
    gasPrice
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(JSON.stringify({
    tool: "viem",
    hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    to: recipient,
    valueWei: value.toString()
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
