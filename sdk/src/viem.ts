import { defineChain } from "viem";

export const vellum = defineChain({
  id: Number(process.env.VELLUM_CHAIN_ID || "90103"),
  name: "Vellum",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [process.env.VELLUM_RPC_URL || "https://rpc.vellum.example"],
      webSocket: [process.env.VELLUM_WS_URL || "wss://rpc.vellum.example/ws"]
    },
    public: {
      http: [process.env.VELLUM_RPC_URL || "https://rpc.vellum.example"],
      webSocket: [process.env.VELLUM_WS_URL || "wss://rpc.vellum.example/ws"]
    }
  },
  blockExplorers: {
    default: {
      name: "Vellum Explorer",
      url: process.env.EXPLORER_URL || "https://explorer.vellum.example"
    }
  },
  testnet: false
});
