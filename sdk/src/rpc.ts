export const vellumRpc = {
  publicHttp: process.env.VELLUM_RPC_URL || "https://rpc.vellum.example",
  publicWebSocket: process.env.VELLUM_WS_URL || "wss://rpc.vellum.example/ws",
  privateHttp: process.env.VELLUM_PRIVATE_RPC_URL || ""
} as const;
