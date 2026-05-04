export const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

export const vellumAddresses = {
  parentChain: {
    portal: zeroAddress,
    standardBridge: zeroAddress,
    crossDomainMessenger: zeroAddress,
    systemConfig: zeroAddress,
    l2OutputOracle: zeroAddress,
    disputeGameFactory: zeroAddress
  },
  l3: {
    standardBridge: zeroAddress,
    crossDomainMessenger: zeroAddress,
    weth: "0x4200000000000000000000000000000000000006",
    multicall3: zeroAddress
  }
} as const;
