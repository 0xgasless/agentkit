import { z } from "zod";
import { Transaction, ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import {
  sendTransaction,
  formatTokenAmount,
  resolveTokenSymbol,
  checkAndApproveTokenAllowance,
} from "../../services";

const SWAP_PROMPT = `
This tool allows you to perform gasless token swaps on supported chains.

You can swap tokens in two ways:
1. Using token addresses (e.g., "0x...")
2. Using token symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)

USAGE GUIDANCE:
- Provide either tokenIn/tokenOut addresses OR tokenInSymbol/tokenOutSymbol
- Specify the amount to swap (in the input token's units)
- Optionally set a custom slippage (default is "auto")
- Optionally set 'approveMax: true' to approve maximum token allowance (default is false)

EXAMPLES:
- Swap by address: "Swap 10 from 0x123... to 0x456..."
- Swap by symbol: "Swap 10 USDC to ETH"
- With max approval: "Swap 10 USDT to ETH with approveMax: true"

Note: This action works on supported networks only (Base, Sonic, Moonbeam, Avalanche, BSC).
All swaps are gasless - no native tokens needed for gas fees.
The transaction will be submitted and the tool will wait for confirmation by default.
`;

export const SmartSwapInput = z
  .object({
    tokenIn: z
      .string()
      .optional()
      .nullable()
      .describe("The address of the input token (token you're selling)"),
    tokenOut: z
      .string()
      .optional()
      .nullable()
      .describe("The address of the output token (token you're buying)"),
    tokenInSymbol: z
      .string()
      .optional()
      .nullable()
      .describe("The symbol of the input token (e.g., 'ETH', 'USDC')"),
    tokenOutSymbol: z
      .string()
      .optional()
      .nullable()
      .describe("The symbol of the output token (e.g., 'ETH', 'USDC')"),
    amount: z.string().describe("The amount of input token to swap"),
    slippage: z
      .string()
      .optional()
      .nullable()
      .default("auto")
      .describe("Slippage tolerance in percentage (e.g., '0.5') or 'auto'"),
    approveMax: z
      .boolean()
      .optional()
      .nullable()
      .default(false)
      .describe("Whether to approve maximum token allowance"),
  })
  .strip()
  .describe("Instructions for swapping tokens");

export async function smartSwap(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartSwapInput>,
): Promise<string> {
  try {
    const chainId = wallet.rpcProvider.chain?.id;
    if (!chainId) {
      return "Error: Unable to determine chain ID from wallet";
    }

    // Resolve token addresses from symbols if provided
    let tokenInAddress = args.tokenIn;
    let tokenOutAddress = args.tokenOut;
    if (args.tokenInSymbol && !tokenInAddress) {
      const resolved = await resolveTokenSymbol(wallet, args.tokenInSymbol);
      if (!resolved) {
        return `Error: Could not resolve token symbol "${args.tokenInSymbol}" to an address on chain ${chainId}`;
      }
      tokenInAddress = resolved;
    }
    if (args.tokenOutSymbol && !tokenOutAddress) {
      const resolved = await resolveTokenSymbol(wallet, args.tokenOutSymbol);
      if (!resolved) {
        return `Error: Could not resolve token symbol "${args.tokenOutSymbol}" to an address on chain ${chainId}`;
      }
      tokenOutAddress = resolved;
    }
    if (!tokenInAddress || !tokenOutAddress) {
      return "Error: Both input and output token addresses are required";
    }

    // Get token details for better user feedback
    let tokenInDetails;
    let tokenOutDetails;

    // Format the amount with proper decimals
    const formattedAmount = await formatTokenAmount(
      wallet,
      tokenInAddress as `0x${string}`,
      args.amount,
    );

    // Construct the API URL with query parameters
    const baseUrl = "https://dln.debridge.finance/v1.0/chain/transaction";
    const queryParams = new URLSearchParams({
      chainId: chainId.toString(),
      tokenIn: tokenInAddress,
      tokenInAmount: formattedAmount,
      tokenOut: tokenOutAddress,
      tokenOutRecipient: await wallet.getAddress(),
      slippage: args.slippage || "auto",
      affiliateFeePercent: "0",
    });
    const formedDebridgeApiUrl = `${baseUrl}?${queryParams.toString()}`;

    // First try to get an estimation to check if the swap is possible
    try {
      const estimationUrl = formedDebridgeApiUrl.replace("/transaction", "/estimation");
      const estimationResponse = await fetch(estimationUrl);
      let parsedEstimation = await estimationResponse.json();
      parsedEstimation = parsedEstimation.estimation;

      if (!estimationResponse.ok) {
        if (
          parsedEstimation.errorMessage?.includes("insufficient liquidity") ||
          parsedEstimation.errorMessage?.includes("no route found")
        ) {
          return `Swap not available: Insufficient liquidity or no route found between these tokens.`;
        }

        if (parsedEstimation.errorMessage?.includes("amount too small")) {
          return `Swap not available: The amount is too small. Please try a larger amount.`;
        }

        console.warn("Estimation failed:", parsedEstimation);
      }
      tokenInDetails = parsedEstimation.tokenIn;
      tokenOutDetails = parsedEstimation.tokenOut;
    } catch (error) {
      console.warn("Error checking swap estimation:", error);
      // Continue even if estimation fails
    }

    const debridgeResponse = await fetch(formedDebridgeApiUrl);
    const transactionData = await debridgeResponse.json();

    if (!debridgeResponse.ok || transactionData.errorCode == 0) {
      // Handle specific error cases
      if (
        transactionData.errorMessage?.includes("insufficient liquidity") ||
        transactionData.errorMessage?.includes("no route found")
      ) {
        return `Swap failed: Insufficient liquidity or no route found between these tokens.`;
      }

      if (transactionData.errorMessage?.includes("amount too small")) {
        return `Swap failed: The amount is too small. Please try a larger amount.`;
      }

      if (transactionData.errorMessage?.includes("Bad Request")) {
        return `Swap failed: Invalid request parameters. Please check your token addresses and amount.
        
For BNB Chain (56), make sure:
1. The token amount is not too small (try at least 0.01 USDT)
2. There is sufficient liquidity for this pair
3. You have enough balance of the input token`;
      }

      if (
        transactionData.errorMessage?.includes("transfer amount exceeds allowance") ||
        transactionData.errorMessage?.includes("BEP20: transfer amount exceeds allowance")
      ) {
        return `Swap failed: Token allowance error. You need to approve the swap contract to spend your tokens.
        
Please try again with "approveMax: true" parameter to automatically approve token spending.
Example: "Swap 0.01 USDT to WETH with approveMax: true"`;
      }

      return `Swap failed: ${transactionData.errorMessage || debridgeResponse.statusText}\nDetails: ${JSON.stringify(transactionData.details || {})}`;
    }
    if (!tokenInDetails || !tokenOutDetails) {
      tokenInDetails = transactionData.tokenIn;
      tokenOutDetails = transactionData.tokenOut;
    }

    // If we only got an estimation without transaction data
    if (!transactionData.tx) {
      const inSymbol = tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
      const outSymbol = tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

      return `Swap estimation:\nInput: ${transactionData.tokenIn.amount} ${transactionData.tokenIn.symbol || inSymbol}\nExpected Output: ${transactionData.tokenOut.amount} ${transactionData.tokenOut.symbol || outSymbol}\nMin Output: ${transactionData.tokenOut.minAmount} ${transactionData.tokenOut.symbol || outSymbol}\nRecommended Slippage: ${transactionData.recommendedSlippage}%`;
    }

    // For non-native tokens, we need to check and approve allowance if needed
    if (tokenInAddress !== "0x0000000000000000000000000000000000000000") {
      const spenderAddress = transactionData.tx.to as `0x${string}`;

      // Check and approve token allowance
      const approvalResult = await checkAndApproveTokenAllowance(
        wallet,
        tokenInAddress as `0x${string}`,
        spenderAddress,
        BigInt(formattedAmount),
        args.approveMax ?? false,
      );

      if (!approvalResult.success) {
        return `Failed to approve token spending: ${approvalResult.error}`;
      }

      // If an approval transaction was sent (it now waits by default),
      // check its result.
      if (approvalResult.userOpHash) {
        // The `sendTransaction` within `approveToken` (called by `checkAndApproveTokenAllowance`)
        // now waits for confirmation. We just need to check the final result.
        // The `approvalResult` reflects the final status.
        console.log(`Token approval successful. UserOpHash: ${approvalResult.userOpHash}`);
      }
    }

    const txResponse = await sendTransaction(wallet, transactionData.tx as Transaction);

    if (!txResponse.success) {
      if (
        typeof txResponse.error === "string" &&
        (txResponse.error.includes("transfer amount exceeds allowance") ||
          txResponse.error.includes("BEP20: transfer amount exceeds allowance"))
      ) {
        return `Swap failed: Token allowance error. You need to approve the swap contract to spend your tokens.
        
Please try again with "approveMax: true" parameter to automatically approve token spending.
Example: "Swap 0.01 USDT to WETH with approveMax: true"`;
      }
      return `Swap failed: ${
        typeof txResponse.error === "string" ? txResponse.error : JSON.stringify(txResponse.error)
      }`;
    }

    // Remove the logic block for `if (args.wait)` and `waitForTransaction`
    // Update the success message based on the awaited result from sendTransaction
    const inSymbol = tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
    const outSymbol = tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

    return `Swap successful!\nInput: ${args.amount} ${inSymbol}\n(Approximate) Output: ${tokenOutDetails?.amount || "?"} ${outSymbol}\nTx Hash: ${txResponse.txHash}`;
  } catch (error) {
    console.error("Smart Swap Error:", error);
    return `An unexpected error occurred during the swap: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class SmartSwapAction implements AgentkitAction<typeof SmartSwapInput> {
  public name = "smart_swap";
  public description = SWAP_PROMPT;
  public argsSchema = SmartSwapInput;
  public func = smartSwap;
  public smartAccountRequired = true;
}
