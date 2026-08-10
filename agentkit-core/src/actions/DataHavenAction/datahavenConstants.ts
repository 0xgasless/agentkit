/**
 * DataHaven Constants
 *
 * Configuration for DataHaven decentralized storage network.
 */

// DataHaven Testnet Configuration
export const DATAHAVEN_TESTNET_CONFIG = {
  chainId: 55931,
  chainName: "DataHaven Testnet",
  rpcUrl: "https://services.datahaven-testnet.network/testnet",
  wssUrl: "wss://services.datahaven-testnet.network/testnet",
  mspUrl: "https://deo-dh-backend.testnet.datahaven-infra.network",
  explorer: "https://explorer.datahaven-testnet.network",
  nativeCurrency: {
    name: "DH",
    symbol: "DH",
    decimals: 18,
  },
};

// Required environment variables for DataHaven
export const DATAHAVEN_REQUIRED_ENV = {
  USE_EOA: "USE_EOA",
  PRIVATE_KEY: "PRIVATE_KEY",
  RPC_URL: "RPC_URL",
  CHAIN_ID: "CHAIN_ID",
  DATAHAVEN_MSP_URL: "DATAHAVEN_MSP_URL",
} as const;

// Error messages
export const DATAHAVEN_CONFIG_ERROR = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ DATAHAVEN CONFIGURATION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before using DataHaven storage actions, please configure the
following environment variables in your .env file:

  # Main Agentkit (keep your existing chain like Avalanche Fuji)
  USE_EOA=true
  PRIVATE_KEY=0x...your_private_key...
  RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
  CHAIN_ID=43113

  # DataHaven Configuration (add these)
  DATAHAVEN_RPC_URL=https://testnet-rpc.datahaven.xyz
  DATAHAVEN_CHAIN_ID=55931
  DATAHAVEN_MSP_URL=https://testnet-msp.datahaven.xyz

DataHaven Testnet Details:
  • Chain ID: 55931
  • Network: DataHaven Testnet (EVM-compatible)
  • Get testnet tokens: https://faucet.datahaven.xyz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

/**
 * Validate DataHaven environment configuration
 * Returns an error message if configuration is missing, or null if valid
 */
export function validateDataHavenConfig(): string | null {
  const missing: string[] = [];

  // Check USE_EOA
  if (process.env.USE_EOA !== "true") {
    missing.push("USE_EOA=true (required for testnet)");
  }

  // Check PRIVATE_KEY
  if (!process.env.PRIVATE_KEY) {
    missing.push("PRIVATE_KEY (your wallet private key)");
  }

  // Check DATAHAVEN_RPC_URL (or fall back to default)
  if (!process.env.DATAHAVEN_RPC_URL && !process.env.RPC_URL) {
    missing.push("DATAHAVEN_RPC_URL (DataHaven RPC endpoint)");
  }

  // Check DATAHAVEN_MSP_URL
  if (!process.env.DATAHAVEN_MSP_URL) {
    missing.push("DATAHAVEN_MSP_URL (Main Storage Provider URL)");
  }

  if (missing.length > 0) {
    return `${DATAHAVEN_CONFIG_ERROR}\nMissing variables:\n${missing.map(m => `  • ${m}`).join("\n")}\n`;
  }

  return null;
}

/**
 * Get DataHaven configuration from environment
 */
export function getDataHavenConfig() {
  return {
    useEoa: process.env.USE_EOA === "true",
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    rpcUrl: process.env.DATAHAVEN_RPC_URL || DATAHAVEN_TESTNET_CONFIG.rpcUrl,
    chainId: Number(process.env.DATAHAVEN_CHAIN_ID) || DATAHAVEN_TESTNET_CONFIG.chainId,
    mspUrl: process.env.DATAHAVEN_MSP_URL || DATAHAVEN_TESTNET_CONFIG.mspUrl,
  };
}

// File operation status types
export type FileStatus = "pending" | "inProgress" | "ready" | "revoked" | "rejected" | "expired";

// Bucket info type
export interface BucketInfo {
  bucketId: string;
  name: string;
  root: string;
  isPublic: boolean;
  sizeBytes: number;
  valuePropId: string;
  fileCount: number;
}

// File info type
export interface FileInfo {
  fileKey: string;
  fingerprint: string;
  bucketId: string;
  location: string;
  size: number;
  isPublic: boolean;
  uploadedAt: Date;
  status: FileStatus;
  blockHash?: string;
  txHash?: string;
}

// MSP Health type
export interface MSPHealth {
  status: "healthy" | "unhealthy";
  version: string;
  service: string;
  components: {
    storage: { status: string };
    postgres: { status: string };
    rpc: { status: string };
  };
}
