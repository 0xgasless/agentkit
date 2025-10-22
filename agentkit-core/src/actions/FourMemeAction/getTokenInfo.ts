/**
 * Four.meme Get Token Info Action
 *
 * Retrieves comprehensive information about a Four.meme token
 *
 * Features:
 * - Token metadata and stats
 * - Bonding curve status
 * - Trading activity
 * - Liquidity information
 */

import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { formatUnits, parseUnits } from "viem";
import {
  TOKEN_MANAGER_HELPER3_ABI,
  FOUR_MEME_CONTRACTS,
  getQuoteTokenSymbol,
  FOUR_MEME_CONSTANTS,
  type TokenInfoResponse,
} from "./constants";

const GET_TOKEN_INFO_PROMPT = `
This tool retrieves detailed information about a meme token on the Four.meme platform.

Information Provided:
- Token version and manager contract
- Trading pair (quote token: BNB/USDT/WHY/CAKE)
- Current price and market cap
- Bonding curve progress and reserves
- Total supply and trading status
- Fee structure

Inputs:
- tokenAddress: The Four.meme token contract address to query

Returns:
- Complete token information
- Bonding curve status
- Trading metrics
- Liquidity details

Important Notes:
- Works on BNB Chain (Chain ID: 56)
- Read-only operation (no transaction needed)
- Shows whether token is still in bonding curve or listed on PancakeSwap
- Useful for checking token status before buying/selling

Example usage:
"Get info for token 0x123..."
"What's the status of token at 0x456...?"
`;

// Input schema
export const GetTokenInfoInput = z
  .object({
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("The Four.meme token contract address to query"),
  })
  .strip()
  .describe("Get detailed information about a Four.meme token");

/**
 * Get comprehensive token information
 */
export async function getTokenInfo(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTokenInfoInput>,
): Promise<string> {
  try {
    // Verify we're on BSC
    const chainId = wallet.rpcProvider.chain?.id;
    if (chainId !== 56) {
      return `Error: Four.meme only operates on BNB Chain (Chain ID: 56). Current chain: ${chainId}`;
    }

    const tokenAddress = args.tokenAddress as `0x${string}`;

    // Get token info from helper contract
    const tokenInfo = (await wallet.rpcProvider.readContract({
      abi: TOKEN_MANAGER_HELPER3_ABI,
      address: FOUR_MEME_CONTRACTS.HELPER,
      functionName: "getTokenInfo",
      args: [tokenAddress],
    })) as TokenInfoResponse;

    if (!tokenInfo) {
      return `Error: Unable to fetch token information. Token may not exist on Four.meme.`;
    }

    // Extract info
    const version = tokenInfo.version as number;
    const manager = tokenInfo.manager as string;
    const quoteToken = tokenInfo.quoteToken as `0x${string}`;
    const lastPrice = tokenInfo.lastPrice as bigint;
    const tradeFeeRate = tokenInfo.tradeFeeRate as bigint;
    const k = tokenInfo.k as bigint;
    const marketCap = tokenInfo.marketCap as bigint;
    const quoteReserve = tokenInfo.quoteReserve as bigint;
    const tokenReserve = tokenInfo.tokenReserve as bigint;
    const isListed = tokenInfo.isListed as boolean;
    const totalSupply = tokenInfo.totalSupply as bigint;

    const quoteTokenSymbol = getQuoteTokenSymbol(quoteToken);

    // Calculate bonding curve progress
    const bondingTarget = parseUnits(FOUR_MEME_CONSTANTS.BONDING_CURVE_TARGET, 18);
    const curveProgress = (quoteReserve * 10000n) / bondingTarget / 100n;
    const remaining = bondingTarget - quoteReserve;

    // Format output
    let result = `📊 Four.meme Token Information\n\n`;

    result += `🪙 Basic Info:\n`;
    result += `- Token Address: ${tokenAddress}\n`;
    result += `- Manager Contract: ${manager}\n`;
    result += `- Version: ${version}\n`;
    result += `- Total Supply: ${formatUnits(totalSupply, 18)} tokens\n`;

    result += `\n💱 Trading Info:\n`;
    result += `- Quote Token: ${quoteTokenSymbol}\n`;
    result += `- Current Price: ${formatUnits(lastPrice, 18)} ${quoteTokenSymbol} per token\n`;
    result += `- Market Cap: ${formatUnits(marketCap, 18)} ${quoteTokenSymbol}\n`;
    result += `- Trading Fee: ${formatUnits(tradeFeeRate, 2)}%\n`;

    result += `\n📈 Bonding Curve:\n`;
    result += `- Status: ${isListed ? "✅ COMPLETED - Listed on PancakeSwap" : "🔄 ACTIVE - In Bonding Curve"}\n`;
    result += `- Progress: ${curveProgress}%\n`;
    result += `- Quote Reserve: ${formatUnits(quoteReserve, 18)} ${quoteTokenSymbol}\n`;
    result += `- Token Reserve: ${formatUnits(tokenReserve, 18)} tokens\n`;

    if (!isListed) {
      result += `- Target: ${FOUR_MEME_CONSTANTS.BONDING_CURVE_TARGET} ${quoteTokenSymbol}\n`;
      result += `- Remaining: ${formatUnits(remaining, 18)} ${quoteTokenSymbol}\n`;
      result += `- Next Milestone: ${curveProgress >= 75n ? "100% (PancakeSwap listing)" : curveProgress >= 50n ? "75%" : curveProgress >= 25n ? "50%" : "25%"}\n`;
    } else {
      result += `- Liquidity: ${FOUR_MEME_CONSTANTS.LIQUIDITY_PERCENTAGE}% tokens paired with collected ${quoteTokenSymbol}\n`;
      result += `- Trading: Available on PancakeSwap\n`;
    }

    result += `\n🔢 Technical:\n`;
    result += `- Bonding Curve K: ${k}\n`;
    result += `- Trading Active: ${!isListed ? "Yes (on Four.meme)" : "Yes (on PancakeSwap)"}\n`;

    if (!isListed) {
      result += `\n💡 Actions:\n`;
      result += `- ✅ Buy tokens on bonding curve\n`;
      result += `- ✅ Sell tokens on bonding curve\n`;
      result += `- ⏳ Wait for PancakeSwap listing at 100%\n`;
    } else {
      result += `\n💡 Next Steps:\n`;
      result += `- Trade on PancakeSwap for better liquidity\n`;
      result += `- Check PancakeSwap pair for current price\n`;
    }

    return result;
  } catch (error) {
    return `Error fetching token info: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Action class
export class GetTokenInfoAction implements AgentkitAction<typeof GetTokenInfoInput> {
  public name = "fourmeme_get_token_info";
  public description = GET_TOKEN_INFO_PROMPT;
  public argsSchema = GetTokenInfoInput;
  public func = getTokenInfo;
  public smartAccountRequired = false; // Read-only, no wallet needed
}
