import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Response from API key verification
 */
export interface AuthVerificationResponse {
  success: boolean;
  data?: {
    privateKey: `0x${string}`;
    address: string;
    rpcUrl: string;
    chainId: number;
  };
  error?: string;
}

/**
 * Mock database of valid API keys with associated wallet data
 * In production, this would be replaced with actual database/service calls
 */
const validApiKeys: Record<string, {
  privateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}> = {
  'test-api-key-123': {
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114
  },
  'demo-key-456': {
    privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114
  }
};

/**
 * Generate a new wallet for unknown API keys (for demo purposes)
 */
function generateWalletForApiKey(apiKey: string): {
  privateKey: `0x${string}`;
  address: string;
  rpcUrl: string;
  chainId: number;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  return {
    privateKey,
    address: account.address,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114
  };
}

/**
 * Verify API key and return wallet information
 * This simulates the /auth/verify-key endpoint functionality
 */
export async function verifyApiKey(apiKey: string): Promise<AuthVerificationResponse> {
  try {
    if (!apiKey) {
      return {
        success: false,
        error: 'API key is required'
      };
    }

    // Check if API key exists in our mock database
    let walletData = validApiKeys[apiKey];
    
    if (!walletData) {
      // For demo purposes, generate a new wallet for unknown keys
      // In production, this would return an error for invalid keys
      const generatedWallet = generateWalletForApiKey(apiKey);
      walletData = {
        privateKey: generatedWallet.privateKey,
        rpcUrl: generatedWallet.rpcUrl,
        chainId: generatedWallet.chainId
      };
      validApiKeys[apiKey] = walletData; // Cache it
    }

    // Calculate address from private key
    const account = privateKeyToAccount(walletData.privateKey);
    
    return {
      success: true,
      data: {
        privateKey: walletData.privateKey,
        address: account.address,
        rpcUrl: walletData.rpcUrl,
        chainId: walletData.chainId
      }
    };
    
  } catch (error) {
    console.error('Error verifying API key:', error);
    return {
      success: false,
      error: 'Internal server error'
    };
  }
}

/**
 * Add a new API key to the valid keys database
 * Useful for testing and development
 */
export function addApiKey(apiKey: string, walletData: {
  privateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}): void {
  validApiKeys[apiKey] = walletData;
}

/**
 * Remove an API key from the valid keys database
 */
export function removeApiKey(apiKey: string): boolean {
  if (validApiKeys[apiKey]) {
    delete validApiKeys[apiKey];
    return true;
  }
  return false;
}

/**
 * Check if an API key exists in the database
 */
export function hasApiKey(apiKey: string): boolean {
  return apiKey in validApiKeys;
}

/**
 * Get all registered API keys (for testing purposes)
 */
export function getRegisteredApiKeys(): string[] {
  return Object.keys(validApiKeys);
} 