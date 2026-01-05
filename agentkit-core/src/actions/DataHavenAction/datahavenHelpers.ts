/**
 * DataHaven Helpers
 * 
 * Utility functions for DataHaven decentralized storage operations.
 * Uses the official StorageHub SDK for MSP operations.
 */

import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDataHavenConfig, validateDataHavenConfig, DATAHAVEN_TESTNET_CONFIG } from "./datahavenConstants";

// Custom chain definition for DataHaven Testnet
export const datahavenTestnet = {
  id: 55931,
  name: "DataHaven Testnet",
  nativeCurrency: {
    name: "DH",
    symbol: "DH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [DATAHAVEN_TESTNET_CONFIG.rpcUrl],
      webSocket: [DATAHAVEN_TESTNET_CONFIG.wssUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "DataHaven Explorer",
      url: DATAHAVEN_TESTNET_CONFIG.explorer,
    },
  },
} as const;

/**
 * DataHaven client bundle
 */
export interface DataHavenClients {
  walletClient: WalletClient;
  publicClient: PublicClient;
  address: `0x${string}`;
  mspUrl: string;
}

/**
 * MSP Client session type - matches SDK's Session type
 */
export interface MspSession {
  token: string;
  user: { address: string };
  [key: string]: unknown; // Index signature for SDK compatibility
}

// Global session storage for MSP client
let currentSession: MspSession | undefined;

/**
 * Set the current MSP session
 */
export function setMspSession(session: MspSession | undefined): void {
  currentSession = session;
}

/**
 * Get the current MSP session
 */
export async function getMspSession(): Promise<MspSession | undefined> {
  return currentSession;
}

/**
 * Initialize DataHaven clients using EOA from environment
 */
export async function initializeDataHavenClients(): Promise<DataHavenClients> {
  // Validate config first
  const configError = validateDataHavenConfig();
  if (configError) {
    throw new Error(configError);
  }

  const config = getDataHavenConfig();
  
  // Create account from private key
  const account = privateKeyToAccount(config.privateKey);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain: datahavenTestnet,
    transport: http(config.rpcUrl),
  });

  // Create public client
  const publicClient = createPublicClient({
    chain: datahavenTestnet,
    transport: http(config.rpcUrl),
  });

  return {
    walletClient,
    publicClient,
    address: account.address,
    mspUrl: config.mspUrl,
  };
}

/**
 * Initialize MSP Client from StorageHub SDK
 */
export async function initializeMspClient() {
  const config = getDataHavenConfig();
  
  try {
    const { MspClient } = await import("@storagehub-sdk/msp-client");
    
    const client = await MspClient.connect(
      { baseUrl: config.mspUrl },
      getMspSession as any // Cast for SDK compatibility
    );
    
    return client;
  } catch (error) {
    logDataHaven(`⚠️ Could not initialize MSP Client: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Authenticate with MSP using SIWE
 * Uses manual flow since it's confirmed to work with DataHaven MSP
 */
export async function authenticateWithMspSdk(
  walletClient: WalletClient,
): Promise<MspSession | null> {
  const config = getDataHavenConfig();
  
  logDataHaven("Attempting SIWE authentication...");
  
  // Use manual SIWE flow which we confirmed works
  return await authenticateWithMspManual(walletClient, config.mspUrl, config.chainId);
}

/**
 * Manual SIWE authentication that matches DataHaven MSP expected format
 */
export async function authenticateWithMspManual(
  walletClient: WalletClient,
  mspUrl: string,
  chainId: number,
): Promise<MspSession | null> {
  try {
    const account = walletClient.account;
    if (!account) {
      throw new Error("No wallet account available");
    }
    const address = account.address;
    
    const domain = new URL(mspUrl).host;
    const uri = mspUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // Step 1: Get nonce from MSP
    logDataHaven("   Getting auth nonce from MSP...");
    const nonceResponse = await fetch(`${mspUrl}/auth/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        chainId,
        domain,
        uri,
      }),
    });
    
    if (!nonceResponse.ok) {
      const errorText = await nonceResponse.text();
      throw new Error(`Nonce request failed: ${nonceResponse.status} - ${errorText}`);
    }
    
    const nonceData = await nonceResponse.json();
    const siweMessage = nonceData.message;
    logDataHaven("   ✅ Got SIWE message from MSP");
    
    // Step 2: Sign the message locally
    logDataHaven("   Signing SIWE message locally...");
    
    // Get private key from env and sign locally
    const config = getDataHavenConfig();
    const signingAccount = privateKeyToAccount(config.privateKey);
    const signature = await signingAccount.signMessage({ message: siweMessage });
    logDataHaven("   ✅ Message signed");
    
    // Step 3: Verify signature with MSP (with retry like SDK does)
    logDataHaven("   Verifying signature with MSP...");
    
    const maxRetries = 10;
    const retryDelay = 100; // ms
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const verifyResponse = await fetch(`${mspUrl}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: siweMessage,
            signature,
          }),
        });
        
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          logDataHaven("   ✅ Signature verified!");
          
          // Create session from response
          const session: MspSession = {
            token: verifyData.token || verifyData.access_token,
            user: { address: address },
          };
          
          setMspSession(session);
          logDataHaven(`✅ Authenticated successfully!`);
          return session;
        }
        
        const errorText = await verifyResponse.text();
        lastError = new Error(`Verify request failed: ${verifyResponse.status} - ${errorText}`);
        
        // Only retry on specific errors
        if (verifyResponse.status !== 401 || !errorText.includes("nonce")) {
          throw lastError;
        }
        
        // Wait before retry
        await sleep(retryDelay);
        
      } catch (error) {
        if (error instanceof Error && !error.message.includes("nonce")) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        await sleep(retryDelay);
      }
    }
    
    throw lastError || new Error("Verification failed after retries");
  } catch (error) {
    logDataHaven(`⚠️ Manual SIWE failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Log step with formatting for DataHaven operations
 */
export function logDataHavenStep(step: number, message: string, data?: Record<string, string | number>) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`\n[DataHaven] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[DataHaven] STEP ${step}: ${message}`);
  console.log(`[DataHaven] Time: ${timestamp}`);
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`[DataHaven]   ${key}: ${value}`);
    }
  }
  console.log(`[DataHaven] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Log DataHaven info message
 */
export function logDataHaven(message: string) {
  console.log(`[DataHaven] ${message}`);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Sleep utility for polling
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = initialDelay * Math.pow(2, i);
      logDataHaven(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Create SIWE message for authentication (fallback if SDK not available)
 */
export function createSiweMessage(params: {
  address: string;
  chainId: number;
  nonce: string;
  domain: string;
  uri: string;
  issuedAt?: string;
  expirationTime?: string;
}): string {
  const issuedAt = params.issuedAt || new Date().toISOString();
  const expirationTime = params.expirationTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  return `${params.domain} wants you to sign in with your Ethereum account:
${params.address}

Sign in to DataHaven

URI: ${params.uri}
Version: 1
Chain ID: ${params.chainId}
Nonce: ${params.nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;
}

/**
 * Derive bucket ID from address and bucket name (fallback)
 */
export function deriveBucketId(address: string, bucketName: string): string {
  const combined = `${address.toLowerCase()}-${bucketName}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}

/**
 * Get MSP info from the MSP endpoint
 */
export async function getMspInfo(mspUrl: string): Promise<{
  mspId: string;
  multiaddresses: string[];
  name: string;
}> {
  const response = await fetch(`${mspUrl}/info`);
  if (!response.ok) {
    throw new Error(`Failed to get MSP info: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get MSP health status
 */
export async function getMspHealth(mspUrl: string): Promise<{
  status: string;
  version: string;
  service: string;
  components: Record<string, { status: string }>;
}> {
  const response = await fetch(`${mspUrl}/health`);
  if (!response.ok) {
    throw new Error(`Failed to get MSP health: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Authenticate with MSP using SIWE (fallback method)
 */
export async function authenticateWithMsp(
  mspUrl: string,
  walletClient: WalletClient,
  address: `0x${string}`,
  chainId: number,
): Promise<{ token: string; profile: unknown }> {
  // Step 1: Get auth nonce
  const nonceResponse = await fetch(`${mspUrl}/auth/nonce?address=${address}`);
  if (!nonceResponse.ok) {
    throw new Error(`Failed to get auth nonce: ${nonceResponse.statusText}`);
  }
  const { nonce } = await nonceResponse.json();

  // Step 2: Create SIWE message
  const domain = new URL(mspUrl).host;
  const message = createSiweMessage({
    address,
    chainId,
    nonce,
    domain,
    uri: mspUrl,
  });

  // Step 3: Sign message
  const signature = await walletClient.signMessage({
    account: address,
    message,
  });

  // Step 4: Verify and get token
  const verifyResponse = await fetch(`${mspUrl}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  
  if (!verifyResponse.ok) {
    throw new Error(`Failed to verify auth: ${verifyResponse.statusText}`);
  }
  
  return verifyResponse.json();
}
