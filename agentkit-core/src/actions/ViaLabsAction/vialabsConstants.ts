/**
 * ViaLabs Cross-Chain Messaging Constants
 *
 * Contains contract addresses, ABIs, and chain configurations
 * for ViaLabs cross-chain messaging infrastructure.
 */

// Supported chain IDs for ViaLabs cross-chain messaging
export const VIALABS_SUPPORTED_CHAINS: Record<
  number,
  {
    name: string;
    messageV3: `0x${string}`;
    feeToken: `0x${string}`; // USDC or USDT
    wrappedGas: `0x${string}`; // WETH, WAVAX, WBNB, etc.
    explorer: string;
    isTestnet: boolean;
  }
> = {
  // Testnets
  43113: {
    // Avalanche Fuji
    name: "Avalanche Fuji",
    messageV3: "0x0000000000000000000000000000000000000000", // To be updated with actual address
    feeToken: "0x5425890298aed601595a70AB815c96711a31Bc65", // USDC on Fuji
    wrappedGas: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c", // WAVAX on Fuji
    explorer: "https://testnet.snowtrace.io",
    isTestnet: true,
  },
  84532: {
    // Base Sepolia
    name: "Base Sepolia",
    messageV3: "0x0000000000000000000000000000000000000000", // To be updated with actual address
    feeToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
    wrappedGas: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
    explorer: "https://sepolia.basescan.org",
    isTestnet: true,
  },

  // Mainnets
  43114: {
    // Avalanche C-Chain
    name: "Avalanche",
    messageV3: "0x0000000000000000000000000000000000000000", // To be updated with actual address
    feeToken: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC on Avalanche
    wrappedGas: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX on Avalanche
    explorer: "https://snowtrace.io",
    isTestnet: false,
  },
  8453: {
    // Base
    name: "Base",
    messageV3: "0x0000000000000000000000000000000000000000", // To be updated with actual address
    feeToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    wrappedGas: "0x4200000000000000000000000000000000000006", // WETH on Base
    explorer: "https://basescan.org",
    isTestnet: false,
  },
  56: {
    // BNB Chain
    name: "BNB Chain",
    messageV3: "0x0000000000000000000000000000000000000000", // To be updated with actual address
    feeToken: "0x55d398326f99059fF775485246999027B3197955", // USDT on BSC
    wrappedGas: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB on BSC
    explorer: "https://bscscan.com",
    isTestnet: false,
  },
};

// Test HelloERC20 token addresses deployed for testing
// These are ViaLabs-enabled cross-chain tokens deployed on testnets (v2 with real MessageClient)
export const HELLO_ERC20_TESTNET_TOKENS: Record<number, `0x${string}`> = {
  43113: "0xc8600dE63d7cbA25967ecf4894be84dB1c9Ee137", // Avalanche Fuji
  84532: "0xb9dB93d419bEDc2C20fe39248D560E7CB1aAABD0", // Base Sepolia
};

// Common cross-chain token contract ABI for ViaLabs-enabled tokens
// This ABI supports the bridge() function that triggers cross-chain transfers
export const ViaLabsBridgeABI = [
  // bridge function - burns tokens on source and triggers cross-chain message
  {
    inputs: [
      { internalType: "uint256", name: "_destChainId", type: "uint256" },
      { internalType: "address", name: "_recipient", type: "address" },
      { internalType: "uint256", name: "_amount", type: "uint256" },
    ],
    name: "bridge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Standard ERC20 functions
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Check if chain is configured for cross-chain
  {
    inputs: [{ internalType: "uint256", name: "chainId", type: "uint256" }],
    name: "isChainActive",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// MessageClient ABI for interacting with ViaLabs messaging directly
export const MessageClientABI = [
  // Get fee estimate for cross-chain message
  {
    inputs: [{ internalType: "uint256", name: "_destChainId", type: "uint256" }],
    name: "getFee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Check message status
  {
    inputs: [{ internalType: "uint256", name: "_txId", type: "uint256" }],
    name: "getMessageStatus",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Helper to check if a chain is supported by ViaLabs
export function isVialabsChainSupported(chainId: number): boolean {
  return chainId in VIALABS_SUPPORTED_CHAINS;
}

// Helper to get chain config
export function getVialabsChainConfig(chainId: number) {
  return VIALABS_SUPPORTED_CHAINS[chainId] || null;
}

// Get list of supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.keys(VIALABS_SUPPORTED_CHAINS).map(Number);
}

// Get testnet chain IDs only
export function getTestnetChainIds(): number[] {
  return Object.entries(VIALABS_SUPPORTED_CHAINS)
    .filter(([, config]) => config.isTestnet)
    .map(([id]) => Number(id));
}

// Get mainnet chain IDs only
export function getMainnetChainIds(): number[] {
  return Object.entries(VIALABS_SUPPORTED_CHAINS)
    .filter(([, config]) => !config.isTestnet)
    .map(([id]) => Number(id));
}
