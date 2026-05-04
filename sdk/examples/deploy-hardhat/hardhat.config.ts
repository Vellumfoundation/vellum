import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    vellum: {
      url: process.env.VELLUM_RPC_URL || "",
      chainId: Number(process.env.VELLUM_CHAIN_ID || "0"),
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
};

export default config;
