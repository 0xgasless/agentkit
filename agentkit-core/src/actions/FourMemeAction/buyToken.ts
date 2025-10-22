/**
 * Four.meme Buy Token Action
 *
 * Purchases meme tokens during the bonding curve phase on Four.meme (BSC)
 *
 * Features:
 * - Buy tokens using BNB, USDT, WHY, or CAKE
 * - Automatic price calculation via bonding curve
 * - Slippage protection
 * - Real-time estimates before purchase
 */

import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { sendTransaction, checkAndApproveTokenAllowance } from "../../services";
import { encodeFunctionData, parseEther, parseUnits, formatUnits } from "viem";
import {
  TOKEN_MANAGER2_ABI,
  TOKEN_MANAGER_HELPER3_ABI,
  FOUR_MEME_CONTRACTS,
  getQuoteTokenSymbol,
  type TokenInfoResponse,
  type TryBuyResponse,
} from "./constants";

const BUY_TOKEN_PROMPT = `
This tool allows you to buy meme tokens on the Four.meme platform during the bonding curve phase.

How it works:
- Tokens are priced on a bonding curve (price increases as more are purchased)
- You pay with BNB, USDT, WHY, or CAKE
- 1% trading fee applies (minimum 0.001 BNB equivalent)
- Once bonding curve hits 100%, liquidity moves to PancakeSwap

Inputs:
- tokenAddress: The address of the Four.meme token to buy
- quoteAmount: Amount of quote tokens (BNB/USDT/WHY/CAKE) to spend
- slippagePercent: Maximum acceptable slippage (default: 1%, range: 0.1-50%)

Returns:
- Estimated tokens received
- Trading fee
- Transaction confirmation
- Updated bonding curve status

Important Notes:
- Only works on BNB Chain (Chain ID: 56)
- Tokens must be in bonding curve phase (not yet listed on PancakeSwap)
- Price increases with each purchase due to bonding curve
- For non-BNB quote tokens, you need sufficient token balance
- Slippage protection prevents unfavorable trades

Example usage:
"Buy tokens at 0x123... with 1 BNB"
"Purchase 0x456... using 100 USDT with 2% slippage"
`;

// Input schema
export const BuyTokenInput = z
  .object({
    tokenAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("The Four.meme token contract address to buy"),
    quoteAmount: z.string().describe("Amount of quote tokens to spend (e.g., '1' for 1 BNB)"),
    slippagePercent: z
      .number()
      .min(0.1)
      .max(50)
      .default(1)
      .describe("Maximum slippage tolerance percentage (default: 1%)"),
  })
  .strip()
  .describe("Buy meme tokens on Four.meme bonding curve");

/**
 * Buy tokens on Four.meme platform
 */
export async function buyToken(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof BuyTokenInput>,
): Promise<string> {
  try {
    // Verify we're on BSC
    const chainId = wallet.rpcProvider.chain?.id;
    if (chainId !== 56) {
      return `Error: Four.meme only operates on BNB Chain (Chain ID: 56). Current chain: ${chainId}`;
    }

    const tokenAddress = args.tokenAddress as `0x${string}`;

    // Step 1: Get token info to determine quote token
    const tokenInfo = (await wallet.rpcProvider.readContract({
      abi: TOKEN_MANAGER_HELPER3_ABI,
      address: FOUR_MEME_CONTRACTS.HELPER,
      functionName: "getTokenInfo",
      args: [tokenAddress],
    })) as TokenInfoResponse;

    if (!tokenInfo) {
      return `Error: Unable to fetch token information. Token may not exist on Four.meme.`;
    }

    // Check if token is already listed (bonding curve completed)
    if (tokenInfo.isListed) {
      return `Error: This token has completed its bonding curve and is now listed on PancakeSwap. Please trade on PancakeSwap instead.`;
    }

    const quoteTokenAddress = tokenInfo.quoteToken as `0x${string}`;
    const quoteTokenSymbol = getQuoteTokenSymbol(quoteTokenAddress);
    const isNativeToken = quoteTokenAddress === "0x0000000000000000000000000000000000000000";

    // Parse quote amount based on quote token decimals (assume 18 for simplicity)
    const quoteAmountWei = parseUnits(args.quoteAmount, 18);

    // Step 2: Estimate buy using helper contract
    const estimate = (await wallet.rpcProvider.readContract({
      abi: TOKEN_MANAGER_HELPER3_ABI,
      address: FOUR_MEME_CONTRACTS.HELPER,
      functionName: "tryBuy",
      args: [tokenAddress, quoteAmountWei],
    })) as TryBuyResponse;

    const tokenAmount = estimate[0] as bigint;
    const tradeFee = estimate[1] as bigint;
    const quoteReserveAfter = estimate[2] as bigint;

    // Calculate minimum tokens with slippage
    const slippageMultiplier = 100 - args.slippagePercent;
    const minTokenAmount = (tokenAmount * BigInt(Math.floor(slippageMultiplier * 100))) / 10000n;

    // Step 3: Approve quote token if not native BNB
    if (!isNativeToken) {
      const approvalResult = await checkAndApproveTokenAllowance(
        wallet,
        quoteTokenAddress,
        FOUR_MEME_CONTRACTS.MANAGER,
        quoteAmountWei + tradeFee,
        false,
      );

      if (!approvalResult.success) {
        return `Error approving ${quoteTokenSymbol}: ${approvalResult.error}`;
      }

      if (approvalResult.txHash) {
        // Approval transaction was sent
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for approval
      }
    }

    // Step 4: Execute buy
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const data = encodeFunctionData({
      abi: TOKEN_MANAGER2_ABI,
      functionName: "buyToken",
      args: [tokenAddress, minTokenAmount, deadline],
    });

    const tx: Transaction = {
      to: FOUR_MEME_CONTRACTS.MANAGER,
      data,
      value: isNativeToken ? quoteAmountWei + tradeFee : 0n,
    };

    const response = await sendTransaction(wallet, tx);

    if (!response.success) {
      return `Failed to buy tokens: ${response.error}`;
    }

    // Format success response
    const tokensReceived = formatUnits(tokenAmount, 18);
    const feeAmount = formatUnits(tradeFee, 18);
    const totalCost = formatUnits(quoteAmountWei + tradeFee, 18);

    // Calculate bonding curve progress
    const curveProgress = (quoteReserveAfter * 10000n) / parseUnits("18", 18) / 100n;

    let result = `✅ Token Purchase Successful!\n\n`;
    result += `Purchase Details:\n`;
    result += `- Tokens Received: ${tokensReceived}\n`;
    result += `- Quote Token Spent: ${args.quoteAmount} ${quoteTokenSymbol}\n`;
    result += `- Trading Fee: ${feeAmount} ${quoteTokenSymbol}\n`;
    result += `- Total Cost: ${totalCost} ${quoteTokenSymbol}\n`;
    result += `- Slippage Protection: ${args.slippagePercent}%\n`;

    result += `\nBonding Curve Status:\n`;
    result += `- Progress: ${curveProgress}%\n`;
    result += `- Quote Reserve: ${formatUnits(quoteReserveAfter, 18)} ${quoteTokenSymbol}\n`;

    if (curveProgress >= 10000n) {
      result += `- ⚠️ Bonding curve complete! Liquidity will be added to PancakeSwap.\n`;
    } else {
      result += `- Remaining to complete: ${formatUnits(parseUnits("18", 18) - quoteReserveAfter, 18)} ${quoteTokenSymbol}\n`;
    }

    result += `\nTransaction Hash: ${response.txHash}\n`;
    result += `Token Address: ${tokenAddress}`;

    return result;
  } catch (error) {
    return `Error buying tokens: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Action class
export class BuyTokenAction implements AgentkitAction<typeof BuyTokenInput> {
  public name = "fourmeme_buy_token";
  public description = BUY_TOKEN_PROMPT;
  public argsSchema = BuyTokenInput;
  public func = buyToken;
  public smartAccountRequired = true;
}
