export const nativeEth = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18,
  native: true
} as const;

export const vellumTokens = [nativeEth] as const;
