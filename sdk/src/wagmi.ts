import { http } from "wagmi";
import { vellum } from "./viem";

export const vellumTransport = http(process.env.VELLUM_RPC_URL || "https://rpc.vellum.example");

export const vellumWagmiChain = vellum;
