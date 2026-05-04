const enabled = process.env.SYNTHETIC_DEPLOYS_ENABLED === "true";

if (!enabled) {
  console.log("Synthetic contract deploy check disabled. Set SYNTHETIC_DEPLOYS_ENABLED=true to run.");
  process.exit(0);
}

if (process.env.PROJECT_ENV === "production" && process.env.SYNTHETIC_MAINNET_DEPLOYS_ENABLED !== "true") {
  throw new Error("Mainnet synthetic deployments require SYNTHETIC_MAINNET_DEPLOYS_ENABLED=true.");
}

throw new Error("Synthetic contract deployment requires a live RPC. Implement deployment flow in Phase 7.");
