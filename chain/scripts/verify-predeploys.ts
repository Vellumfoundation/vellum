const requiredPredeploys = {
  L2ToL1MessagePasser: "0x4200000000000000000000000000000000000016",
  L2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
  L2StandardBridge: "0x4200000000000000000000000000000000000010",
  GasPriceOracle: "0x420000000000000000000000000000000000000F",
  WETH9: "0x4200000000000000000000000000000000000006"
};

console.log("Expected standard OP Stack predeploys:");
console.log(JSON.stringify(requiredPredeploys, null, 2));
console.log("Phase 2 will add live bytecode checks against VELLUM_RPC_URL.");
