/**
 * Chainlink CRE Constants
 * Contains supported networks, chain selectors, and Keystone Forwarder addresses.
 */

export interface NetworkConfig {
  chainSelector: string;
  forwarderAddress: string;
  isTestnet: boolean;
}

export const CRE_SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  // Mainnets
  "arbitrum-one": {
    chainSelector: "ethereum-mainnet-arbitrum-1",
    forwarderAddress: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    isTestnet: false,
  },
  avalanche: {
    chainSelector: "avalanche-mainnet",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: false,
  },
  base: {
    chainSelector: "ethereum-mainnet-base-1",
    forwarderAddress: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    isTestnet: false,
  },
  "bnb-chain": {
    chainSelector: "binance_smart_chain-mainnet",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: false,
  },
  ethereum: {
    chainSelector: "ethereum-mainnet",
    forwarderAddress: "0x0b93082D9b3C7C97fAcd250082899BAcf3af3885",
    isTestnet: false,
  },
  optimism: {
    chainSelector: "ethereum-mainnet-optimism-1",
    forwarderAddress: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    isTestnet: false,
  },
  polygon: {
    chainSelector: "polygon-mainnet",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: false,
  },

  // Testnets
  "arbitrum-sepolia": {
    chainSelector: "ethereum-testnet-sepolia-arbitrum-1",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: true,
  },
  "avalanche-fuji": {
    chainSelector: "avalanche-testnet-fuji",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: true,
  },
  "base-sepolia": {
    chainSelector: "ethereum-testnet-sepolia-base-1",
    forwarderAddress: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    isTestnet: true,
  },
  "bsc-testnet": {
    chainSelector: "binance_smart_chain-testnet",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: true,
  },
  "ethereum-sepolia": {
    chainSelector: "ethereum-testnet-sepolia",
    forwarderAddress: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    isTestnet: true,
  },
  "optimism-sepolia": {
    chainSelector: "ethereum-testnet-sepolia-optimism-1",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: true,
  },
  "polygon-amoy": {
    chainSelector: "polygon-testnet-amoy",
    forwarderAddress: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    isTestnet: true,
  },
};

export const CRE_DOCS_SUMMARY = `
Chainlink CRE (Compute Runtime Environment) Overview:

1. Triggers:
   - Cron Trigger: Time-based schedule (e.g., "*/30 * * * * *").
   - EVM Log Trigger: Fires on specific smart contract events. Requires contract address and topics.

2. Onchain Write:
   - Workflows do not write directly to your contract.
   - They submit a signed report to the KeystoneForwarder.
   - KeystoneForwarder validates signatures and calls your contract's \`onReport()\` method.
   - Your contract MUST implement \`IReceiver\` interface.

3. Forwarder Addresses:
   - You must enable the specific Forwarder address for your chain in your consumer contract.
   - See CRE_SUPPORTED_NETWORKS for the list of addresses.

4. Deployment:
   - Use \`cre deploy --env <environment>\`.
   - Requires \`CRE_ETH_PRIVATE_KEY\` in .env (if writing onchain) or at least a dummy key.

   - Use \`cre deploy --env <environment>\`.
   - Requires \`CRE_ETH_PRIVATE_KEY\` in .env (if writing onchain) or at least a dummy key.

5. Keystone Forwarder Addresses (PRODUCTION - Use these for mainnet/testnet deployment):
   | Network | Chain Name | Forwarder Address |
   |---------|------------|-------------------|
   | Avalanche Fuji | avalanche-testnet-fuji | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Polygon Amoy | polygon-testnet-amoy | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Base Sepolia | ethereum-testnet-sepolia-base-1 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
   | Ethereum Sepolia | ethereum-testnet-sepolia | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
   | BSC Testnet | binance_smart_chain-testnet | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Arbitrum Sepolia | ethereum-testnet-sepolia-arbitrum-1 | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Optimism Sepolia | ethereum-testnet-sepolia-optimism-1 | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Avalanche Mainnet | avalanche-mainnet | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Polygon Mainnet | polygon-mainnet | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Base Mainnet | ethereum-mainnet-base-1 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
   | Ethereum Mainnet | ethereum-mainnet | 0x0b93082D9b3C7C97fAcd250082899BAcf3af3885 |
   | BSC Mainnet | binance_smart_chain-mainnet | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
   | Arbitrum One | ethereum-mainnet-arbitrum-1 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
   | OP Mainnet | ethereum-mainnet-optimism-1 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |

6. Mock Forwarder Addresses (SIMULATION ONLY - Use for 'cre workflow simulate --broadcast'):
   | Network | Chain Name | Mock Forwarder Address |
   |---------|------------|------------------------|
   | Avalanche Fuji | avalanche-testnet-fuji | 0x2e7371a5d032489e4f60216d8d898a4c10805963 |
   | Polygon Amoy | polygon-testnet-amoy | 0x3675a5eb2286a3f87e8278fc66edf458a2e3bb74 |
   | Base Sepolia | ethereum-testnet-sepolia-base-1 | 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5 |
   | Ethereum Sepolia | ethereum-testnet-sepolia | 0x15fC6ae953E024d975e77382eEeC56A9101f9F88 |
   | BSC Testnet | binance_smart_chain-testnet | 0xa238e42cb8782808dbb2f37e19859244ec4779b0 |
   | Arbitrum Sepolia | ethereum-testnet-sepolia-arbitrum-1 | 0xd41263567ddfead91504199b8c6c87371e83ca5d |
   | Optimism Sepolia | ethereum-testnet-sepolia-optimism-1 | 0xa2888380dff3704a8ab6d1cd1a8f69c15fea5ee3 |
   | Avalanche Mainnet | avalanche-mainnet | 0xdc21e279934ff6721cadfdd112dafb3261f09a2c |
   | Polygon Mainnet | polygon-mainnet | 0xf458d621885e29a5003ea9bbba5280d54e19b1ce |
   | Base Mainnet | ethereum-mainnet-base-1 | 0x5e342a8438b4f5d39e72875fcee6f76b39cce548 |
   | Ethereum Mainnet | ethereum-mainnet | 0xa3d1ad4ac559a6575a114998affb2fb2ec97a7d9 |
   | BSC Mainnet | binance_smart_chain-mainnet | 0x6f3239bbb26e98961e1115aba83f8a282e5508c8 |
   | Arbitrum One | ethereum-mainnet-arbitrum-1 | 0xd770499057619c9a76205fd4168161cf94abc532 |
   | OP Mainnet | ethereum-mainnet-optimism-1 | 0x9119a1501550ed94a3f2794038ed9258337afa18 |
`;
