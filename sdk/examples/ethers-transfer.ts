import { ethers } from "ethers";

async function main() {
  const rpcUrl = process.env.VELLUM_RPC_URL || "https://rpc.vellum.example";
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }

  const recipient = process.env.RECIPIENT_ADDRESS || "0x000000000000000000000000000000000000dEaD";
  const value = ethers.parseEther(process.env.TRANSFER_AMOUNT_ETH || "0.000001");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const feeData = await provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits("1", "gwei")) +
    ethers.parseUnits("1", "gwei");
  const tx = await wallet.sendTransaction({
    to: recipient,
    value,
    type: 0,
    gasPrice
  });
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error(`Transaction ${tx.hash} was not mined.`);
  }

  console.log(JSON.stringify({
    tool: "ethers",
    hash: tx.hash,
    status: receipt.status === 1 ? "success" : "reverted",
    blockNumber: receipt.blockNumber,
    to: recipient,
    valueWei: value.toString()
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
