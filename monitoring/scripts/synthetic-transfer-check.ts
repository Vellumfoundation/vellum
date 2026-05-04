const enabled = process.env.SYNTHETIC_TRANSFERS_ENABLED === "true";

if (!enabled) {
  console.log("Synthetic transfer check disabled. Set SYNTHETIC_TRANSFERS_ENABLED=true to run.");
  process.exit(0);
}

if (process.env.PROJECT_ENV === "production" && process.env.SYNTHETIC_MAINNET_SPEND_ENABLED !== "true") {
  throw new Error("Mainnet synthetic transfers require SYNTHETIC_MAINNET_SPEND_ENABLED=true.");
}

throw new Error("Synthetic transfer check requires a funded wallet and live RPC. Implement transaction flow in Phase 7.");
