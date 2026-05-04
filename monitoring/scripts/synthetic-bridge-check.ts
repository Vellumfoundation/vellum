const enabled = process.env.SYNTHETIC_BRIDGE_ENABLED === "true";

if (!enabled) {
  console.log("Synthetic bridge check disabled. Set SYNTHETIC_BRIDGE_ENABLED=true to run.");
  process.exit(0);
}

throw new Error("Synthetic bridge checks require deployed bridge contracts. Implement in Phase 7.");
