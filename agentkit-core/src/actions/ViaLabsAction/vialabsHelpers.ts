/**
 * ViaLabs Helper Functions
 *
 * Utility functions for ViaLabs cross-chain messaging operations
 */

import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import {
  VIALABS_SUPPORTED_CHAINS,
  ViaLabsBridgeABI,
  isVialabsChainSupported,
  getVialabsChainConfig,
} from "./vialabsConstants";

/**
 * Check if a cross-chain route is supported
 */
export function isRouteSupported(sourceChainId: number, destChainId: number): boolean {
  return isVialabsChainSupported(sourceChainId) && isVialabsChainSupported(destChainId);
}

/**
 * Get token balance for a ViaLabs-enabled token
 */
export async function getVialabsTokenBalance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
): Promise<bigint> {
  try {
    const balance = (await wallet.rpcProvider.readContract({
      abi: ViaLabsBridgeABI,
      address: tokenAddress,
      functionName: "balanceOf",
      args: [ownerAddress],
    })) as bigint;
    return balance;
  } catch (error) {
    console.error("Error getting token balance:", error);
    return BigInt(0);
  }
}

/**
 * Get token info (name, symbol, decimals)
 */
export async function getVialabsTokenInfo(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    const [name, symbol, decimals] = await Promise.all([
      wallet.rpcProvider.readContract({
        abi: ViaLabsBridgeABI,
        address: tokenAddress,
        functionName: "name",
      }) as Promise<string>,
      wallet.rpcProvider.readContract({
        abi: ViaLabsBridgeABI,
        address: tokenAddress,
        functionName: "symbol",
      }) as Promise<string>,
      wallet.rpcProvider.readContract({
        abi: ViaLabsBridgeABI,
        address: tokenAddress,
        functionName: "decimals",
      }) as Promise<number>,
    ]);
    return { name, symbol, decimals };
  } catch (error) {
    console.error("Error getting token info:", error);
    return null;
  }
}

/**
 * Check if destination chain is active on the token contract
 */
export async function isDestinationChainActive(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  destChainId: number,
): Promise<boolean> {
  try {
    const isActive = (await wallet.rpcProvider.readContract({
      abi: ViaLabsBridgeABI,
      address: tokenAddress,
      functionName: "isChainActive",
      args: [BigInt(destChainId)],
    })) as boolean;
    return isActive;
  } catch (error) {
    // If the function doesn't exist or reverts, assume it's not a ViaLabs token
    console.error("Error checking chain active status:", error);
    return false;
  }
}

/**
 * Format a bridge transaction summary
 */
export function formatBridgeSummary(params: {
  tokenSymbol: string;
  amount: string;
  sourceChainId: number;
  destChainId: number;
  recipient: string;
  txHash?: string;
}): string {
  const sourceConfig = getVialabsChainConfig(params.sourceChainId);
  const destConfig = getVialabsChainConfig(params.destChainId);

  const sourceName = sourceConfig?.name || `Chain ${params.sourceChainId}`;
  const destName = destConfig?.name || `Chain ${params.destChainId}`;

  let summary = `Bridge ${params.amount} ${params.tokenSymbol} from ${sourceName} to ${destName}`;
  summary += `\nRecipient: ${params.recipient}`;

  if (params.txHash) {
    const explorer = sourceConfig?.explorer || "";
    summary += `\nTransaction: ${params.txHash}`;
    if (explorer) {
      summary += `\nExplorer: ${explorer}/tx/${params.txHash}`;
    }
  }

  return summary;
}

/**
 * Get supported chains summary for user display
 */
export function getSupportedChainsSummary(): string {
  const chains = Object.entries(VIALABS_SUPPORTED_CHAINS);
  const testnets = chains.filter(([, c]) => c.isTestnet);
  const mainnets = chains.filter(([, c]) => !c.isTestnet);

  let summary = "**ViaLabs Supported Chains:**\n\n";

  summary += "**Testnets:**\n";
  testnets.forEach(([id, config]) => {
    summary += `- ${config.name} (Chain ID: ${id})\n`;
  });

  summary += "\n**Mainnets:**\n";
  mainnets.forEach(([id, config]) => {
    summary += `- ${config.name} (Chain ID: ${id})\n`;
  });

  return summary;
}
