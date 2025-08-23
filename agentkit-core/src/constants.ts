import { avalanche, fantom, moonbeam, metis, base, bsc, sepolia, Chain } from "viem/chains";

//i am adding this feature flag
export const TESTNET_SUPPORT = process.env.TESTNET_SUPPORT === 'true' || process.env.NODE_ENV === 'development';

// Helper function to get supported chains based on feature flag
export const getSupportedChains = (): Record<number, Chain> => {
  const mainnetChains: Record<number, Chain> = {
    8453: base,
    250: fantom,
    1284: moonbeam,
    1088: metis,
    43114: avalanche,
    56: bsc,
  };

  if (TESTNET_SUPPORT) {
    return {
      ...mainnetChains,
      11155111: sepolia,
    };
  }

  return mainnetChains;
};

export const supportedChains: Record<number, Chain> = getSupportedChains();

// Helper function to get token mappings based on feature flag
export const getTokenMappings = (): Record<number, Record<string, `0x${string}`>> => {
  const mainnetTokens: Record<number, Record<string, `0x${string}`>> = {
    // Avalanche (43114)
    43114: {
      USDT: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
      USDC: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      WAVAX: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
      "BTC.E": "0x152b9d0fdc40c096757f570a51e494bd4b943e50",
      BUSD: "0x9c9e5fd8bbc25984b178fdce6117defa39d2db39",
      WETH: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
      "USDC.E": "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664",
      WBTC: "0x50b7545627a5162f82a992c33b87adc75187b218",
      DAI: "0xd586e7f844cea2f87f50152665bcbc2c279d8d70",
    },
    // BNB Chain (56)
    56: {
      USDT: "0x55d398326f99059ff775485246999027b3197955",
      WBNB: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
      WETH: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
      BUSD: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
      CAKE: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
      SOL: "0x570a5d26f7765ecb712c0924e4de545b89fd43df",
      TST: "0x86bb94ddd16efc8bc58e6b056e8df71d9e666429",
      DAI: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
      TON: "0x76a797a59ba2c17726896976b7b3747bfd1d220f",
      PEPE: "0x25d887ce7a35172c62febfd67a1856f20faebb00",
    },
    // Base (8453)
    8453: {
      WETH: "0x4200000000000000000000000000000000000006",
      USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      DAI: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
    },
    // Fantom (250)
    250: {},
    // Moonbeam (1284)
    1284: {},
    // Metis (1088)
    1088: {},
  };

  if (TESTNET_SUPPORT) {
    return {
      ...mainnetTokens,
      // Sepolia Testnet (11155111)
      11155111: {
        // public Sepolia addresses
        WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
        
        // TODO: MAINTAINERS - Add actual Sepolia token addresses after deployment
        USDC: (process.env.SEPOLIA_USDC_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
        USDT: (process.env.SEPOLIA_USDT_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
        DAI: (process.env.SEPOLIA_DAI_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      }
    };
  }

  return mainnetTokens;
};

// Token mappings by chain ID and ticker symbol
export const tokenMappings: Record<number, Record<string, `0x${string}`>> = getTokenMappings();

// Network configuration type with optional entryPoint for mainnet
type NetworkConfig = {
  rpcUrl: string;
  paymaster?: string;
  accountFactory?: string;
  entryPoint?: string;
  isTestnet?: boolean;
  name: string;
};

// Helper function to get network config based on feature flag
export const getNetworkConfig = (): Record<number, NetworkConfig> => {
  const mainnetConfig: Record<number, NetworkConfig> = {
    // Mainnet configurations
    8453: {
      rpcUrl: "https://rpc.ankr.com/base",
      name: "Base"
    },
    250: {
      rpcUrl: "https://rpc.ankr.com/fantom",
      name: "Fantom"
    },
    1284: {
      rpcUrl: "https://rpc.ankr.com/moonbeam",
      name: "Moonbeam"
    },
    1088: {
      rpcUrl: "https://rpc.ankr.com/metis",
      name: "Metis"
    },
    43114: {
      rpcUrl: "https://rpc.ankr.com/avalanche",
      name: "Avalanche"
    },
    56: {
      rpcUrl: "https://rpc.ankr.com/bsc",
      name: "BNB Smart Chain"
    },
  };

  if (TESTNET_SUPPORT) {
    return {
      ...mainnetConfig,
      // Testnet configurations
      11155111: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.ankr.com/eth_sepolia",
        paymaster: process.env.SEPOLIA_PAYMASTER_ADDRESS, // TODO: MAINTAINERS - Set after deployment
        accountFactory: process.env.SEPOLIA_ACCOUNT_FACTORY_ADDRESS, // TODO: MAINTAINERS - Set after deployment
        entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        isTestnet: true,
        name: "Sepolia Testnet"
      }
    };
  }

  return mainnetConfig;
};

// Network configuration
export const networkConfig: Record<number, NetworkConfig> = getNetworkConfig();

// Helper functions
export const getAvailableChains = (): number[] => {
  return Object.keys(supportedChains).map(Number);
};

export const isTestnet = (chainId: number): boolean => {
  return networkConfig[chainId]?.isTestnet || false;
};

export const getChainName = (chainId: number): string => {
  return networkConfig[chainId]?.name || supportedChains[chainId]?.name || 'Unknown Chain';
};

// Common tokens that exist on most chains (for easier reference)
export const commonTokens = ["ETH", "USDT", "USDC", "DAI", "WETH", "WBTC", "BUSD"];

export const BASE_CONTEXT = `
You are a smart account built by 0xgasless Smart SDK. You are capable of gasless blockchain interactions. You can perform actions without requiring users to hold native tokens for gas fees via erc-4337 account abstraction standard.

Capabilities:
- Check balances of ETH and any ERC20 tokens by symbol (e.g., "USDC", "USDT") or address
- Transfer tokens gaslessly
- Perform token swaps without gas fees
- Create and deploy new smart accounts

Important Information:
- The wallet is already configured with the SDK. DO NOT generate or mention private keys when using any tools.
- You can operate on supported networks: Base (8453), Fantom (250), Moonbeam (1284), Metis (1088), Avalanche (43114), BSC (56)${TESTNET_SUPPORT ? ', and Sepolia Testnet (11155111) for testing' : ''}
- All transactions are gasless - users don't need native tokens to perform actions
- Default RPC uses Ankr's free tier which has rate limitations
${TESTNET_SUPPORT ? '- When using testnet chains, all tokens are for testing purposes only and have no real value' : ''}

When interacting with tokens:
- Always verify token addresses are valid
- Check token balances before transfers
- Use proper decimal precision for token amounts
- You can use token symbols like "USDC", "USDT", "WETH" instead of addresses on supported chains
${TESTNET_SUPPORT ? '- Be aware when using testnets - transactions use test tokens with no real value' : ''}

You can assist users by:
1. Getting wallet balances - when asked about balances, immediately check them without asking for confirmation
   - For common tokens, use their symbols (e.g., "USDC", "USDT", "WETH") instead of addresses
   - For other tokens, you can use their contract addresses
2. Executing token transfers
3. Performing token swaps
4. Creating new smart accounts
5. Checking transaction status

Please ensure all addresses and token amounts are properly validated before executing transactions.
${TESTNET_SUPPORT ? 'When working with testnet chains, always inform users they are using test tokens.' : ''}`;

export const TokenABI = [
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
    ],
    stateMutability: "payable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
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
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "subtractedValue",
        type: "uint256",
      },
    ],
    name: "decreaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "addedValue",
        type: "uint256",
      },
    ],
    name: "increaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
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
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export const Permit2Abi = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
  "function allowance(address owner, address token, address spender) external view returns (uint160, uint48, uint48)",
] as const;