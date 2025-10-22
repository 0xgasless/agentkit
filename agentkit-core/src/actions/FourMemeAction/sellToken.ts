/**
 * Four.meme Sell Token Action
 *
 * Sells meme tokens during the bonding curve phase on Four.meme (BSC)
 *
 * Features:
 * - Sell tokens back to bonding curve
 * - Receive BNB, USDT, WHY, or CAKE
 * - Automatic price calculation
 * - Slippage protection
 */

import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { sendTransaction, checkAndApproveTokenAllowance } from "../../services";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import {
  TOKEN_MANAGER2_ABI,
  TOKEN_MANAGER_HELPER3_ABI,
  FOUR_MEME_CONTRACTS,
  getQuoteTokenSymbol,
  type TokenInfoResponse,
  type TrySellResponse,
} from "./constants";

const SELL_TOKEN_PROMPT = `
This tool allows you to sell meme tokens on the Four.meme platform during the bonding curve phase.

How it works:
- Sell tokens back to the bonding curve
- Receive BNB, USDT, WHY, or CAKE (depends on token's quote token)
- Price decreases as more tokens are sold (bonding curve)
- 1% trading fee applies (minimum 0.001 BNB equivalent)

Inputs:
- tokenAddress: The address of the Four.meme token to sell
- tokenAmount: Amount of tokens to sell
- slippagePercent: Maximum acceptable slippage (default: 1%, range: 0.1-50%)

Returns:
- Estimated quote tokens received
- Trading fee
- Transaction confirmation
- Updated bonding curve status

Important Notes:
- Only works on BNB Chain (Chain ID: 56)
- Tokens must be in bonding curve phase (not yet listed on PancakeSwap)
- You must hold the tokens you want to sell
- Token approval required before first sell
- Price decreases with each sale due to bonding curve

Example usage:
"Sell 100000 tokens at 0x123..."
"Sell 50000 of my tokens at 0x456... with 2% slippage"
`;

// Input schema
export const SellTokenInput = z
  .object({
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("The Four.meme token contract address to sell"),
    tokenAmount: z.string().describe("Amount of tokens to sell (in token units)"),
    slippagePercent: z
      .number()
      .min(0.1)
      .max(50)
      .default(1)
      .describe("Maximum slippage tolerance percentage (default: 1%)"),
  })
  .strip()
  .describe("Sell meme tokens on Four.meme bonding curve");

/**
 * Sell tokens on Four.meme platform
 */
export async function sellToken(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SellTokenInput>,
): Promise<string> {
  try {
    // Verify we're on BSC
    const chainId = wallet.rpcProvider.chain?.id;
    if (chainId !== 56) {
      return `Error: Four.meme only operates on BNB Chain (Chain ID: 56). Current chain: ${chainId}`;
    }

    const tokenAddress = args.tokenAddress as `0x${string}`;
    const tokenAmountWei = parseUnits(args.tokenAmount, 18);

    // Step 1: Get token info
    const tokenInfo = (await wallet.rpcProvider.readContract({
      abi: TOKEN_MANAGER_HELPER3_ABI,
      address: FOUR_MEME_CONTRACTS.HELPER,
      functionName: "getTokenInfo",
      args: [tokenAddress],
    })) as TokenInfoResponse;

    if (!tokenInfo) {
      return `Error: Unable to fetch token information. Token may not exist on Four.meme.`;
    }

    // Check if token is already listed
    if (tokenInfo.isListed) {
      return `Error: This token has completed its bonding curve and is now listed on PancakeSwap. Please trade on PancakeSwap instead.`;
    }

    const quoteTokenAddress = tokenInfo.quoteToken as `0x${string}`;
    const quoteTokenSymbol = getQuoteTokenSymbol(quoteTokenAddress);

    // Step 2: Estimate sell using helper contract
    const estimate = (await wallet.rpcProvider.readContract({
      abi: TOKEN_MANAGER_HELPER3_ABI,
      address: FOUR_MEME_CONTRACTS.HELPER,
      functionName: "trySell",
      args: [tokenAddress, tokenAmountWei],
    })) as TrySellResponse;

    const quoteAmount = estimate[0] as bigint;
    const tradeFee = estimate[1] as bigint;
    const quoteReserveAfter = estimate[2] as bigint;

    // Calculate minimum quote amount with slippage
    const slippageMultiplier = 100 - args.slippagePercent;
    const minQuoteAmount = (quoteAmount * BigInt(Math.floor(slippageMultiplier * 100))) / 10000n;

    // Step 3: Approve tokens for selling
    const approvalResult = await checkAndApproveTokenAllowance(
      wallet,
      tokenAddress,
      FOUR_MEME_CONTRACTS.MANAGER,
      tokenAmountWei,
      false,
    );

    if (!approvalResult.success) {
      return `Error approving tokens for sale: ${approvalResult.error}`;
    }

    if (approvalResult.txHash) {
      // Wait for approval transaction
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Step 4: Execute sell
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const data = encodeFunctionData({
      abi: TOKEN_MANAGER2_ABI,
      functionName: "sellToken",
      args: [tokenAddress, tokenAmountWei, minQuoteAmount, deadline],
    });

    const tx: Transaction = {
      to: FOUR_MEME_CONTRACTS.MANAGER,
      data,
      value: 0n,
    };

    const response = await sendTransaction(wallet, tx);

    if (!response.success) {
      return `Failed to sell tokens: ${response.error}`;
    }

    // Format success response
    const quoteReceived = formatUnits(quoteAmount, 18);
    const feeAmount = formatUnits(tradeFee, 18);
    const netReceived = formatUnits(quoteAmount - tradeFee, 18);

    // Calculate bonding curve progress
    const curveProgress = (quoteReserveAfter * 10000n) / parseUnits("18", 18) / 100n;

    let result = `✅ Token Sale Successful!\n\n`;
    result += `Sale Details:\n`;
    result += `- Tokens Sold: ${args.tokenAmount}\n`;
    result += `- Quote Received: ${quoteReceived} ${quoteTokenSymbol}\n`;
    result += `- Trading Fee: ${feeAmount} ${quoteTokenSymbol}\n`;
    result += `- Net Received: ${netReceived} ${quoteTokenSymbol}\n`;
    result += `- Slippage Protection: ${args.slippagePercent}%\n`;

    result += `\nBonding Curve Status:\n`;
    result += `- Progress: ${curveProgress}%\n`;
    result += `- Quote Reserve: ${formatUnits(quoteReserveAfter, 18)} ${quoteTokenSymbol}\n`;
    result += `- Remaining to complete: ${formatUnits(parseUnits("18", 18) - quoteReserveAfter, 18)} ${quoteTokenSymbol}\n`;

    result += `\nTransaction Hash: ${response.txHash}\n`;
    result += `Token Address: ${tokenAddress}`;

    return result;
  } catch (error) {
    return `Error selling tokens: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Action class
export class SellTokenAction implements AgentkitAction<typeof SellTokenInput> {
  public name = "fourmeme_sell_token";
  public description = SELL_TOKEN_PROMPT;
  public argsSchema = SellTokenInput;
  public func = sellToken;
  public smartAccountRequired = true;
}
