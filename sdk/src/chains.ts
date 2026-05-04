export const VELLUM_CHAIN_ID = Number(process.env.VELLUM_CHAIN_ID || "90103");
export const VELLUM_CHAIN_ID_HEX = `0x${VELLUM_CHAIN_ID.toString(16)}`;

export const vellumChain = {
  id: VELLUM_CHAIN_ID,
  name: "Vellum",
  network: "vellum",
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
} as const;

export const addVellumChainPayload = {
  chainId: VELLUM_CHAIN_ID_HEX,
  chainName: "Vellum",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: [process.env.VELLUM_RPC_URL || "https://rpc.vellum.example"],
  blockExplorerUrls: [process.env.EXPLORER_URL || "https://explorer.vellum.example"]
};
