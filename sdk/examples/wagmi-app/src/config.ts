import { createConfig, http } from "wagmi";
import { vellum } from "@vellum/sdk/viem";

export const config = createConfig({
  chains: [vellum],
  transports: {
    [vellum.id]: http(process.env.VELLUM_RPC_URL || "https://rpc.vellum.example")
  }
});
