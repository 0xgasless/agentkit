/**
 * ViaLabs Cross-Chain Bridge Action
 *
 * Enables AI agents to bridge tokens across chains using ViaLabs
 * cross-chain messaging infrastructure.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseUnits, createPublicClient, http } from "viem";
import type { AgentkitAction } from "../../agentkit";
import { sendTransaction } from "../../services";
import {
  ViaLabsBridgeABI,
  isVialabsChainSupported,
  getVialabsChainConfig,
  getSupportedChainIds,
} from "./vialabsConstants";
import {
  isRouteSupported,
  getVialabsTokenInfo,
  getVialabsTokenBalance,
  isDestinationChainActive,
  formatBridgeSummary,
  getSupportedChainsSummary,
} from "./vialabsHelpers";

const VIALABS_BRIDGE_PROMPT = `
This tool bridges tokens across different blockchains using ViaLabs cross-chain messaging.

It takes the following inputs:
- tokenAddress: The address of the ViaLabs-enabled token contract to bridge
- destChainId: The destination chain ID to bridge tokens to
- recipient: The recipient address on the destination chain
- amount: The amount of tokens to bridge (as a string, e.g., "10.5")

Important notes:
- The token contract must be a ViaLabs-enabled cross-chain token (extends MessageClient)
- Both source and destination chains must be configured on the token contract
- Tokens are burned on the source chain and minted on the destination chain
- This is NOT a wrapped token bridge - it's native cross-chain token transfer
- The action will wait and track until tokens arrive on destination chain

Supported chains include: Avalanche, Avalanche Fuji (testnet), Base, Base Sepolia (testnet), BNB Chain.

Example usage:
"Bridge 100 tokens from contract 0x... to Base Sepolia chain (84532) for recipient 0x..."
`;

/**
 * Input schema for ViaLabs bridge action
 */
export const ViaLabsBridgeInput = z
  .object({
    tokenAddress: z
      .string()
      .describe("The ViaLabs-enabled token contract address to bridge from"),
    destChainId: z
      .number()
      .describe("The destination chain ID to bridge tokens to"),
    recipient: z
      .string()
      .describe("The recipient address on the destination chain"),
    amount: z
      .string()
      .describe("The amount of tokens to bridge (e.g., '10.5')"),
  })
  .strip()
  .describe("Input for bridging tokens across chains using ViaLabs");

// ERC20 ABI for balance checking
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Chain RPC endpoints for destination tracking
const CHAIN_RPC_ENDPOINTS: Record<number, string> = {
  43113: "https://api.avax-test.network/ext/bc/C/rpc", // Avalanche Fuji
  84532: "https://sepolia.base.org", // Base Sepolia
  43114: "https://api.avax.network/ext/bc/C/rpc", // Avalanche Mainnet
  8453: "https://mainnet.base.org", // Base Mainnet
  56: "https://bsc-dataseed.binance.org/", // BNB Chain
};

// Destination token addresses (same order as HELLO_ERC20_TESTNET_TOKENS)
const DESTINATION_TOKEN_ADDRESSES: Record<number, `0x${string}`> = {
  43113: "0xc8600dE63d7cbA25967ecf4894be84dB1c9Ee137", // Avalanche Fuji
  84532: "0xb9dB93d419bEDc2C20fe39248D560E7CB1aAABD0", // Base Sepolia
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get balance on destination chain
 */
async function getDestinationBalance(
  destChainId: number,
  tokenAddress: `0x${string}`,
  recipient: `0x${string}`,
): Promise<bigint> {
  const rpcUrl = CHAIN_RPC_ENDPOINTS[destChainId];
  if (!rpcUrl) {
    throw new Error(`No RPC endpoint for chain ${destChainId}`);
  }

  // Get the destination token address
  const destTokenAddress = DESTINATION_TOKEN_ADDRESSES[destChainId] || tokenAddress;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const balance = await client.readContract({
    address: destTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [recipient],
  });

  return balance;
}

/**
 * Bridge tokens across chains using ViaLabs with destination tracking
 */
export async function vialabsBridge(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof ViaLabsBridgeInput>,
): Promise<string> {
  try {
    const sourceChainId = wallet.rpcProvider.chain?.id;
    const startTime = Date.now();

    if (!sourceChainId) {
      return "Error: Could not determine source chain ID from wallet.";
    }

    // Validate source chain is supported
    if (!isVialabsChainSupported(sourceChainId)) {
      return `Error: Source chain ${sourceChainId} is not supported by ViaLabs.\n\n${getSupportedChainsSummary()}`;
    }

    // Validate destination chain is supported
    if (!isVialabsChainSupported(args.destChainId)) {
      return `Error: Destination chain ${args.destChainId} is not supported by ViaLabs.\n\n${getSupportedChainsSummary()}`;
    }

    // Validate route
    if (!isRouteSupported(sourceChainId, args.destChainId)) {
      return `Error: Route from chain ${sourceChainId} to ${args.destChainId} is not supported.`;
    }

    // Cannot bridge to same chain
    if (sourceChainId === args.destChainId) {
      return "Error: Cannot bridge to the same chain. Use a regular transfer instead.";
    }

    const tokenAddress = args.tokenAddress as `0x${string}`;
    const recipient = args.recipient as `0x${string}`;

    // Get token info
    const tokenInfo = await getVialabsTokenInfo(wallet, tokenAddress);
    if (!tokenInfo) {
      return `Error: Could not get token info for ${tokenAddress}. Make sure this is a valid ViaLabs-enabled token contract.`;
    }

    // Check if destination chain is active on the token contract
    const isActive = await isDestinationChainActive(wallet, tokenAddress, args.destChainId);
    if (!isActive) {
      const destConfig = getVialabsChainConfig(args.destChainId);
      return `Error: Destination chain ${destConfig?.name || args.destChainId} is not configured on this token contract. The token contract owner needs to configure this chain first.`;
    }

    // Get wallet address - try smart account first, fall back to EOA wallet
    let walletAddress: `0x${string}`;
    try {
      walletAddress = (await wallet.getAddress()) as `0x${string}`;
    } catch (addrError) {
      // If smart account fails, try to create EOA wallet from env
      const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
      const rpc = process.env.RPC_URL;
      const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;
      
      if (!pk) {
        return `Error: Could not get wallet address. Smart account may not be initialized on this chain and no PRIVATE_KEY configured for EOA fallback.`;
      }
      
      if (!rpc) {
        return `Error: Could not get wallet address. Smart account may not be initialized on this chain and no RPC_URL configured for EOA fallback.`;
      }
      
      try {
        const { createEoaWallet } = await import("../../services");
        const eoa = createEoaWallet({ privateKey: pk, rpcUrl: rpc, chainId });
        walletAddress = eoa.address as `0x${string}`;
      } catch (eoaError) {
        return `Error: Could not get wallet address. Smart account failed and EOA fallback also failed: ${eoaError instanceof Error ? eoaError.message : String(eoaError)}`;
      }
    }
    
    const balance = await getVialabsTokenBalance(wallet, tokenAddress, walletAddress);
    const amountBigInt = parseUnits(args.amount, tokenInfo.decimals);

    if (balance < amountBigInt) {
      const formattedBalance = (Number(balance) / 10 ** tokenInfo.decimals).toFixed(6);
      return `Error: Insufficient balance. You have ${formattedBalance} ${tokenInfo.symbol} but trying to bridge ${args.amount} ${tokenInfo.symbol}.`;
    }

    // Get initial balance on destination chain for tracking
    let initialDestBalance: bigint;
    try {
      initialDestBalance = await getDestinationBalance(args.destChainId, tokenAddress, recipient);
    } catch (e) {
      initialDestBalance = 0n;
    }

    // Encode the bridge function call
    const data = encodeFunctionData({
      abi: ViaLabsBridgeABI,
      functionName: "bridge",
      args: [BigInt(args.destChainId), recipient, amountBigInt],
    });

    // Create and send transaction
    const tx: Transaction = {
      to: tokenAddress,
      data,
      value: 0n,
    };

    const response = await sendTransaction(wallet, tx);

    if (!response || !response.success) {
      return `Bridge transaction failed: ${response?.error || "Unknown error"}`;
    }

    const txTime = Date.now();

    // Format initial success message
    const sourceConfig = getVialabsChainConfig(sourceChainId);
    const destConfig = getVialabsChainConfig(args.destChainId);
    const summary = formatBridgeSummary({
      tokenSymbol: tokenInfo.symbol,
      amount: args.amount,
      sourceChainId,
      destChainId: args.destChainId,
      recipient: args.recipient,
      txHash: response.txHash,
    });

    // Build status message with source chain confirmation
    let statusMessage = `✅ SOURCE CHAIN TRANSACTION CONFIRMED!\n\n${summary}\n\n`;
    statusMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    statusMessage += `🔄 VIALABS CROSS-CHAIN VALIDATION IN PROGRESS...\n`;
    statusMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    statusMessage += `⏳ Waiting for ViaLabs validators to relay message...\n`;
    statusMessage += `   • Source: ${sourceConfig?.name || sourceChainId} ✅\n`;
    statusMessage += `   • Validators: Processing...\n`;
    statusMessage += `   • Destination: ${destConfig?.name || args.destChainId} ⏳\n\n`;

    // Poll for destination balance change
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
    const pollInterval = 15 * 1000; // Check every 15 seconds
    let elapsed = 0;
    let bridgeCompleted = false;
    let finalDestBalance = initialDestBalance;

    while (elapsed < maxWaitTime) {
      await sleep(pollInterval);
      elapsed = Date.now() - txTime;

      try {
        finalDestBalance = await getDestinationBalance(args.destChainId, tokenAddress, recipient);
        
        if (finalDestBalance > initialDestBalance) {
          bridgeCompleted = true;
          break;
        }
      } catch (e) {
        // Continue polling on error
      }

      // Update progress (this won't show in real-time due to how the action returns, 
      // but we log it for debugging)
      const elapsedSecs = Math.floor(elapsed / 1000);
      console.log(`[ViaLabs] Waiting for cross-chain message... ${elapsedSecs}s elapsed`);
    }

    const totalTime = Date.now() - startTime;
    const totalSeconds = Math.floor(totalTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    if (bridgeCompleted) {
      const receivedAmount = finalDestBalance - initialDestBalance;
      const formattedReceived = (Number(receivedAmount) / 10 ** tokenInfo.decimals).toFixed(6);

      return `✅ CROSS-CHAIN BRIDGE COMPLETE!\n\n${summary}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎉 TOKENS RECEIVED ON DESTINATION CHAIN!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `   • Source: ${sourceConfig?.name || sourceChainId} ✅ (burned ${args.amount} ${tokenInfo.symbol})\n` +
        `   • ViaLabs Validators: Relayed ✅\n` +
        `   • Destination: ${destConfig?.name || args.destChainId} ✅ (minted ${formattedReceived} ${tokenInfo.symbol})\n\n` +
        `⏱️ Total cross-chain time: ${timeString}\n` +
        `📊 ViaLabs validator processing verified!`;
    } else {
      return statusMessage +
        `⚠️ Destination chain confirmation pending after ${timeString}.\n` +
        `   ViaLabs validators are still processing the message.\n` +
        `   The tokens should arrive soon. You can check the balance manually:\n\n` +
        `   Destination Token: ${DESTINATION_TOKEN_ADDRESSES[args.destChainId] || tokenAddress}\n` +
        `   Recipient: ${recipient}\n` +
        `   Chain: ${destConfig?.name || args.destChainId}`;
    }
  } catch (error) {
    return `Error executing ViaLabs bridge: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * ViaLabs Bridge Action class
 */
export class ViaLabsBridgeAction implements AgentkitAction<typeof ViaLabsBridgeInput> {
  public name = "vialabs_bridge";
  public description = VIALABS_BRIDGE_PROMPT;
  public argsSchema = ViaLabsBridgeInput;
  public func = vialabsBridge;
  public smartAccountRequired = true;
}
