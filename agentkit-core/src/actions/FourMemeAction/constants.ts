/**
 * Four.meme Protocol Constants and ABIs
 *
 * Four.meme is a fair-launch meme token platform on BNB Chain (BSC)
 * Features: No-code token creation, bonding curve pricing, auto-liquidity on PancakeSwap
 *
 * Platform Details:
 * - Chain: BNB Chain (56)
 * - Total Supply: 1,000,000,000 tokens (preset for all launches)
 * - Bonding Curve Target: ~18 BNB
 * - Auto-Liquidity: 20% tokens + collected funds paired on PancakeSwap
 * - Trading Fee: 1% (minimum 0.001 BNB)
 */

// Four.meme Contract Addresses on BSC (Chain ID: 56)
export const FOUR_MEME_CONTRACTS = {
  // TokenManagerHelper3 - Main helper contract for info and estimates
  HELPER: "0x8888888888888888888888888888888888888888" as `0x${string}`, // Placeholder - needs actual address

  // TokenManager2 - Main token manager contract
  MANAGER: "0x9999999999999999999999999999999999999999" as `0x${string}`, // Placeholder - needs actual address

  // Factory contract for token creation
  FACTORY: "0x7777777777777777777777777777777777777777" as `0x${string}`, // Placeholder - needs actual address
} as const;

// Supported trading tokens on Four.meme
export const FOUR_MEME_QUOTE_TOKENS = {
  BNB: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  USDT: "0x55d398326f99059ff775485246999027b3197955" as `0x${string}`,
  WHY: "0x9ec02756a559700d8d9e79ece56809f7bcc5dc27" as `0x${string}`,
  CAKE: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82" as `0x${string}`,
} as const;

// Four.meme API Base URL
export const FOUR_MEME_API_BASE = "https://api.four.meme" as const;

// Platform constants
export const FOUR_MEME_CONSTANTS = {
  TOTAL_SUPPLY: "1000000000", // 1 billion tokens (preset)
  BONDING_CURVE_TARGET: "18", // 18 BNB target
  LIQUIDITY_PERCENTAGE: 20, // 20% of tokens for liquidity
  TRADING_FEE_PERCENTAGE: 1, // 1% trading fee
  MIN_TRADING_FEE: "0.001", // 0.001 BNB minimum fee
  LAUNCH_FEE: "0.005", // ~0.005 BNB transaction fee
} as const;

/**
 * TokenManagerHelper3 ABI
 * Used for querying token info and estimating buy/sell operations
 */
export const TOKEN_MANAGER_HELPER3_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
    ],
    name: "getTokenInfo",
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "version", type: "uint8" },
          { internalType: "address", name: "manager", type: "address" },
          { internalType: "address", name: "quoteToken", type: "address" },
          { internalType: "uint256", name: "lastPrice", type: "uint256" },
          { internalType: "uint256", name: "tradeFeeRate", type: "uint256" },
          { internalType: "uint256", name: "k", type: "uint256" },
          { internalType: "uint256", name: "marketCap", type: "uint256" },
          { internalType: "uint256", name: "quoteReserve", type: "uint256" },
          { internalType: "uint256", name: "tokenReserve", type: "uint256" },
          { internalType: "bool", name: "isListed", type: "bool" },
          { internalType: "uint256", name: "totalSupply", type: "uint256" },
        ],
        internalType: "struct TokenInfo",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "quoteAmount",
        type: "uint256",
      },
    ],
    name: "tryBuy",
    outputs: [
      {
        internalType: "uint256",
        name: "tokenAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "tradeFee",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "quoteReserveAfter",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "tokenReserveAfter",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenAmount",
        type: "uint256",
      },
    ],
    name: "trySell",
    outputs: [
      {
        internalType: "uint256",
        name: "quoteAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "tradeFee",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "quoteReserveAfter",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "tokenReserveAfter",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * TokenManager2 ABI
 * Used for executing buy/sell transactions
 */
export const TOKEN_MANAGER2_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "minTokenAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "buyToken",
    outputs: [
      {
        internalType: "uint256",
        name: "tokenAmount",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "tokenAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minQuoteAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "sellToken",
    outputs: [
      {
        internalType: "uint256",
        name: "quoteAmount",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Token Factory ABI
 * Used for creating new meme tokens
 */
export const TOKEN_FACTORY_ABI = [
  {
    inputs: [
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol",
        type: "string",
      },
      {
        internalType: "string",
        name: "description",
        type: "string",
      },
      {
        internalType: "string",
        name: "logoUrl",
        type: "string",
      },
      {
        internalType: "address",
        name: "quoteToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "startTime",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minBuyPerUser",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxBuyPerUser",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "initialBuyAmount",
        type: "uint256",
      },
    ],
    name: "createToken",
    outputs: [
      {
        internalType: "address",
        name: "tokenAddress",
        type: "address",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "symbol",
        type: "string",
      },
    ],
    name: "TokenCreated",
    type: "event",
  },
] as const;

/**
 * TokenInfo response type from getTokenInfo
 */
export interface TokenInfoResponse {
  version: number;
  manager: string;
  quoteToken: string;
  lastPrice: bigint;
  tradeFeeRate: bigint;
  k: bigint;
  marketCap: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
  isListed: boolean;
  totalSupply: bigint;
}

/**
 * TryBuy response type
 */
export interface TryBuyResponse {
  0: bigint; // tokenAmount
  1: bigint; // tradeFee
  2: bigint; // quoteReserveAfter
  3: bigint; // tokenReserveAfter
}

/**
 * TrySell response type
 */
export interface TrySellResponse {
  0: bigint; // quoteAmount
  1: bigint; // tradeFee
  2: bigint; // quoteReserveAfter
  3: bigint; // tokenReserveAfter
}

/**
 * Helper function to get quote token address from symbol
 */
export function getQuoteTokenAddress(symbol: string): `0x${string}` {
  const normalized = symbol.toUpperCase();
  switch (normalized) {
    case "BNB":
      return FOUR_MEME_QUOTE_TOKENS.BNB;
    case "USDT":
      return FOUR_MEME_QUOTE_TOKENS.USDT;
    case "WHY":
      return FOUR_MEME_QUOTE_TOKENS.WHY;
    case "CAKE":
      return FOUR_MEME_QUOTE_TOKENS.CAKE;
    default:
      throw new Error(`Unsupported quote token: ${symbol}. Supported tokens: BNB, USDT, WHY, CAKE`);
  }
}

/**
 * Helper function to get quote token symbol from address
 */
export function getQuoteTokenSymbol(address: string): string {
  const normalized = address.toLowerCase();
  for (const [symbol, addr] of Object.entries(FOUR_MEME_QUOTE_TOKENS)) {
    if (addr.toLowerCase() === normalized) {
      return symbol;
    }
  }
  return "UNKNOWN";
}
