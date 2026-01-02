/**
 * ViaLabs Get Info Action
 *
 * Provides information about ViaLabs cross-chain messaging support
 * and helps users understand the available chains and requirements.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import type { AgentkitAction } from "../../agentkit";
import {
  VIALABS_SUPPORTED_CHAINS,
  isVialabsChainSupported,
} from "./vialabsConstants";
import { getSupportedChainsSummary } from "./vialabsHelpers";

const VIALABS_INFO_PROMPT = `
This tool provides information about ViaLabs cross-chain messaging capabilities.

Use this tool when:
- The user asks about cross-chain bridging options
- The user wants to know which chains are supported for ViaLabs
- The user needs help understanding how to bridge tokens across chains
- The user asks about ViaLabs capabilities

It can optionally take a chainId to check if a specific chain is supported.
`;

/**
 * Input schema for ViaLabs info action
 */
export const ViaLabsInfoInput = z
  .object({
    chainId: z
      .number()
      .optional()
      .describe("Optional chain ID to check if it's supported"),
  })
  .strip()
  .describe("Input for getting ViaLabs cross-chain info");

/**
 * Get information about ViaLabs cross-chain messaging
 */
export async function vialabsGetInfo(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof ViaLabsInfoInput>,
): Promise<string> {
  try {
    const currentChainId = wallet.rpcProvider.chain?.id;

    let response = "# ViaLabs Cross-Chain Messaging\n\n";

    // Check if specific chain was requested
    if (args.chainId) {
      const isSupported = isVialabsChainSupported(args.chainId);
      const chainConfig = VIALABS_SUPPORTED_CHAINS[args.chainId];

      if (isSupported && chainConfig) {
        response += `✅ Chain ${args.chainId} (${chainConfig.name}) is supported!\n\n`;
        response += `- Type: ${chainConfig.isTestnet ? "Testnet" : "Mainnet"}\n`;
        response += `- Explorer: ${chainConfig.explorer}\n`;
      } else {
        response += `❌ Chain ${args.chainId} is not currently configured for ViaLabs bridging.\n\n`;
      }
    }

    // Add current chain info
    if (currentChainId) {
      const currentConfig = VIALABS_SUPPORTED_CHAINS[currentChainId];
      if (currentConfig) {
        response += `\n## Current Chain\n`;
        response += `You are connected to ${currentConfig.name} (Chain ID: ${currentChainId})\n`;
        response += `Type: ${currentConfig.isTestnet ? "Testnet" : "Mainnet"}\n`;
      }
    }

    // Add supported chains summary
    response += `\n${getSupportedChainsSummary()}`;

    // Add usage instructions
    response += `\n## How to Bridge Tokens\n\n`;
    response += `To bridge tokens using ViaLabs, you need:\n`;
    response += `1. A ViaLabs-enabled token contract deployed on both source and destination chains\n`;
    response += `2. The token contract address\n`;
    response += `3. The destination chain ID\n`;
    response += `4. The recipient address on the destination chain\n`;
    response += `5. The amount to bridge\n\n`;
    response += `Use the \`vialabs_bridge\` tool to execute a bridge transaction.\n`;

    return response;
  } catch (error) {
    return `Error getting ViaLabs info: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * ViaLabs Info Action class
 */
export class ViaLabsInfoAction implements AgentkitAction<typeof ViaLabsInfoInput> {
  public name = "vialabs_info";
  public description = VIALABS_INFO_PROMPT;
  public argsSchema = ViaLabsInfoInput;
  public func = vialabsGetInfo;
  public smartAccountRequired = true;
}
