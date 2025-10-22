/**
 * Four.meme Launch Token Action
 *
 * Creates and launches a new meme token on Four.meme platform (BSC)
 *
 * Features:
 * - No-code token deployment
 * - Fixed 1B total supply
 * - Bonding curve pricing
 * - Multi-token trading pairs (BNB, USDT, WHY, CAKE)
 * - Optional launch parameters (start time, buy limits)
 */

import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { sendTransaction } from "../../services";
import { encodeFunctionData, parseEther, parseUnits } from "viem";
import {
  TOKEN_FACTORY_ABI,
  FOUR_MEME_CONTRACTS,
  getQuoteTokenAddress,
  FOUR_MEME_CONSTANTS,
} from "./constants";

const LAUNCH_TOKEN_PROMPT = `
This tool allows you to launch a new meme token on the Four.meme platform (BNB Chain).

Four.meme is a fair-launch platform with:
- Fixed 1 billion token supply (preset for all launches)
- Bonding curve pricing (0% → 100% = ~18 BNB collected)
- Automatic PancakeSwap liquidity when bonding curve completes
- Multi-token trading pairs: BNB, USDT, WHY, CAKE

Inputs:
- name: Token name (e.g., "My Meme Token")
- symbol: Token ticker symbol (e.g., "MMT")
- description: Brief description of your token/project
- logoUrl: URL to token logo image (optional)
- quoteToken: Trading pair token - one of: "BNB", "USDT", "WHY", "CAKE" (default: "BNB")
- startTime: Unix timestamp for trading start (optional, 0 = immediate)
- minBuyPerUser: Minimum tokens per user purchase (optional, in token units)
- maxBuyPerUser: Maximum tokens per user purchase (optional, in token units, 10M = 1%)
- initialBuyAmount: Amount of quote tokens to buy immediately (optional, protects from snipers)

Returns:
- Transaction hash and deployed token address
- Token info and trading details

Important Notes:
- Only works on BNB Chain (Chain ID: 56)
- Launch fee: ~0.005 BNB (transaction fee only)
- Total supply is always 1,000,000,000 tokens
- When bonding curve hits 100%, 20% tokens + collected funds auto-pair on PancakeSwap
- Trading fee: 1% (minimum 0.001 BNB)

Example usage:
"Launch a token called 'Super Doge' with symbol 'SDOGE' trading in BNB"
`;

// Input schema with validation
export const LaunchTokenInput = z
  .object({
    name: z.string().min(1).max(50).describe("Token name (1-50 characters)"),
    symbol: z.string().min(1).max(10).describe("Token symbol/ticker (1-10 characters)"),
    description: z.string().max(500).describe("Token description (max 500 characters)"),
    logoUrl: z.string().url().optional().default("").describe("URL to token logo image (optional)"),
    quoteToken: z
      .enum(["BNB", "USDT", "WHY", "CAKE"])
      .default("BNB")
      .describe("Trading pair token: BNB, USDT, WHY, or CAKE"),
    startTime: z
      .number()
      .optional()
      .default(0)
      .describe("Trading start time (Unix timestamp, 0 = immediate)"),
    minBuyPerUser: z
      .string()
      .optional()
      .default("0")
      .describe("Minimum tokens per user (optional, 0 = no minimum)"),
    maxBuyPerUser: z
      .string()
      .optional()
      .default("10000000")
      .describe("Maximum tokens per user (optional, 10M = 1% of supply)"),
    initialBuyAmount: z
      .string()
      .optional()
      .default("0")
      .describe("Quote token amount to buy immediately (optional, protects from snipers)"),
  })
  .strip()
  .describe("Launch a new meme token on Four.meme (BSC)");

/**
 * Launch a new meme token on Four.meme
 */
export async function launchToken(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof LaunchTokenInput>,
): Promise<string> {
  try {
    // Verify we're on BSC
    const chainId = wallet.rpcProvider.chain?.id;
    if (chainId !== 56) {
      return `Error: Four.meme only operates on BNB Chain (Chain ID: 56). Current chain: ${chainId}. Please switch to BSC.`;
    }

    // Get quote token address
    const quoteTokenAddress = getQuoteTokenAddress(args.quoteToken);

    // Convert amounts to proper units
    const minBuy = parseUnits(args.minBuyPerUser, 18); // Token decimals = 18
    const maxBuy = parseUnits(args.maxBuyPerUser, 18);

    // Calculate value to send (for BNB quote token + initial buy)
    let valueToSend = BigInt(0);
    if (args.quoteToken === "BNB" && args.initialBuyAmount !== "0") {
      valueToSend = parseEther(args.initialBuyAmount);
    }

    // Encode the createToken function call
    const data = encodeFunctionData({
      abi: TOKEN_FACTORY_ABI,
      functionName: "createToken",
      args: [
        args.name,
        args.symbol,
        args.description,
        args.logoUrl,
        quoteTokenAddress,
        BigInt(args.startTime),
        minBuy,
        maxBuy,
        args.quoteToken === "BNB" ? valueToSend : parseUnits(args.initialBuyAmount, 18), // For non-BNB, use token units
      ],
    });

    // Build transaction
    const tx: Transaction = {
      to: FOUR_MEME_CONTRACTS.FACTORY,
      data,
      value: valueToSend,
    };

    // Send transaction
    const response = await sendTransaction(wallet, tx);

    if (!response.success) {
      return `Failed to launch token: ${response.error}`;
    }

    // Format success response
    let result = `✅ Token Launched Successfully on Four.meme!\n\n`;
    result += `Token Details:\n`;
    result += `- Name: ${args.name}\n`;
    result += `- Symbol: ${args.symbol}\n`;
    result += `- Total Supply: ${FOUR_MEME_CONSTANTS.TOTAL_SUPPLY} (1 billion)\n`;
    result += `- Trading Pair: ${args.quoteToken}\n`;
    result += `- Description: ${args.description}\n`;

    if (args.logoUrl) {
      result += `- Logo: ${args.logoUrl}\n`;
    }

    result += `\nBonding Curve:\n`;
    result += `- Target: ${FOUR_MEME_CONSTANTS.BONDING_CURVE_TARGET} ${args.quoteToken}\n`;
    result += `- Auto-Liquidity: ${FOUR_MEME_CONSTANTS.LIQUIDITY_PERCENTAGE}% tokens when 100% reached\n`;

    if (args.startTime > 0) {
      const startDate = new Date(args.startTime * 1000);
      result += `\nStart Time: ${startDate.toUTCString()}\n`;
    } else {
      result += `\nTrading: Live Now!\n`;
    }

    if (args.minBuyPerUser !== "0" || args.maxBuyPerUser !== "10000000") {
      result += `\nBuy Limits:\n`;
      if (args.minBuyPerUser !== "0") {
        result += `- Minimum: ${args.minBuyPerUser} tokens per user\n`;
      }
      result += `- Maximum: ${args.maxBuyPerUser} tokens per user\n`;
    }

    if (args.initialBuyAmount !== "0") {
      result += `\nInitial Purchase: ${args.initialBuyAmount} ${args.quoteToken}\n`;
    }

    result += `\nTransaction Hash: ${response.txHash}\n`;
    result += `\nNote: Your token will be tradable on Four.meme immediately. `;
    result += `When the bonding curve reaches 100%, liquidity will automatically be created on PancakeSwap.`;

    return result;
  } catch (error) {
    return `Error launching token: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Action class
export class LaunchTokenAction implements AgentkitAction<typeof LaunchTokenInput> {
  public name = "fourmeme_launch_token";
  public description = LAUNCH_TOKEN_PROMPT;
  public argsSchema = LaunchTokenInput;
  public func = launchToken;
  public smartAccountRequired = true;
}
