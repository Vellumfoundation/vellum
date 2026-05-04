import { ethers } from "hardhat";

async function main() {
  const Counter = await ethers.getContractFactory("Counter");
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice ?? feeData.maxFeePerGas ?? 1_000_000_000n) + 1_000_000_000n;
  const counter = await Counter.deploy({ type: 0, gasPrice });
  await counter.waitForDeployment();
  const deploymentTx = counter.deploymentTransaction();
  const receipt = await deploymentTx?.wait();

  console.log(JSON.stringify({
    tool: "hardhat",
    contract: "Counter",
    address: await counter.getAddress(),
    transactionHash: deploymentTx?.hash,
    blockNumber: receipt?.blockNumber
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
