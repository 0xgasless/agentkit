import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import {
  formatTokenAmount,
  resolveTokenSymbol,
  checkAndApproveTokenAllowance,
} from "../../services";
import { getQuote, TradeParameters, OrderKind, SupportedChainId } from "@cowprotocol/cow-sdk";

const COWSWAP_SWAP_PROMPT = `
This tool provides price quotes from CowSwap for comparison and planning purposes.

⚠️  IMPORTANT: This action only provides quotes - it does NOT execute swaps.

CowSwap uses a unique batch auction mechanism with Coincidence of Wants (CoW) that can provide better prices and MEV protection compared to traditional AMMs.

You can get quotes for token swaps in two ways:
1. Using token addresses (e.g., "0x...")
2. Using token symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)

USAGE GUIDANCE:
- Provide either tokenIn/tokenOut addresses OR tokenInSymbol/tokenOutSymbol
- Specify the amount to swap (in the input token's units)
- Get quotes from CowSwap's batch auction for optimal pricing
- Optionally set a custom slippage (default is 50 basis points = 0.5%)

EXAMPLES:
- "Get CowSwap quote for 10 USDC to ETH"
- "Quote 100 USDT to USDC on CowSwap"

Note: CowSwap is available on Ethereum Mainnet, Gnosis Chain, and Avalanche.
For actual swap execution, use the smart_swap action which supports multiple DEXs including potential CowSwap integration.
`;

export const CowSwapSwapInput = z
  .object({
    // Token input options (either addresses or symbols)
    tokenInAddress: z
      .string()
      .optional()
      .nullable()
      .describe("The input token contract address (e.g., 0x...)"),
    tokenOutAddress: z
      .string()
      .optional()
      .nullable()
      .describe("The output token contract address (e.g., 0x...)"),
    tokenInSymbol: z
      .string()
      .optional()
      .nullable()
      .describe("The input token symbol (e.g., USDC, WETH, DAI)"),
    tokenOutSymbol: z
      .string()
      .optional()
      .nullable()
      .describe("The output token symbol (e.g., ETH, USDC, DAI)"),

    // Amount and order parameters
    amount: z.string().describe("The amount of input token to swap"),
    slippageBps: z
      .number()
      .optional()
      .nullable()
      .default(50)
      .describe("Slippage tolerance in basis points (default: 50 = 0.5%)"),

    // Optional parameters
    validitySeconds: z
      .number()
      .optional()
      .nullable()
      .default(3600)
      .describe("Order validity in seconds (default: 1 hour)"),
  })
  .strip()
  .describe("Instructions for getting a CowSwap quote");

export async function cowSwapSwap(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CowSwapSwapInput>,
): Promise<string> {
  try {
    const currentChainId = wallet.rpcProvider.chain?.id;
    if (!currentChainId) {
      return "Error: Unable to determine the current chain ID from the wallet.";
    }

    // CowSwap is available on Ethereum Mainnet (1), Gnosis Chain (100), and Avalanche (43114)
    if (currentChainId !== 1 && currentChainId !== 100 && currentChainId !== 43114) {
      return `Error: CowSwap is not available on chain ID ${currentChainId}. CowSwap is available on Ethereum Mainnet (1), Gnosis Chain (100), and Avalanche (43114).`;
    }

    const userAddress = await wallet.getAddress();

    // Resolve token addresses from symbols if provided
    let tokenInAddress: `0x${string}`;
    let tokenOutAddress: `0x${string}`;

    if (args.tokenInSymbol && args.tokenOutSymbol) {
      const resolvedTokenIn = await resolveTokenSymbol(wallet, args.tokenInSymbol);
      const resolvedTokenOut = await resolveTokenSymbol(wallet, args.tokenOutSymbol);

      if (!resolvedTokenIn || !resolvedTokenOut) {
        return `Error: Could not resolve token symbols. tokenIn: ${args.tokenInSymbol}, tokenOut: ${args.tokenOutSymbol}`;
      }

      tokenInAddress = resolvedTokenIn;
      tokenOutAddress = resolvedTokenOut;
    } else if (args.tokenInAddress && args.tokenOutAddress) {
      tokenInAddress = args.tokenInAddress as `0x${string}`;
      tokenOutAddress = args.tokenOutAddress as `0x${string}`;
    } else {
      return "Error: You must provide either (tokenInSymbol AND tokenOutSymbol) OR (tokenInAddress AND tokenOutAddress)";
    }

    // Format the amount
    let formattedAmount: string;
    try {
      formattedAmount = await formatTokenAmount(wallet, tokenInAddress, args.amount);
    } catch (error) {
      console.error("Error formatting token amount:", error);
      return `Error: Could not format token amount for ${tokenInAddress}. Ensure it's a valid token address and you have balance. Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Get token decimals for proper amount formatting
    const getTokenDecimals = (address: string): number => {
      const commonSixDecimalTokens = [
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT Ethereum
        "0xa0b86a33e6441c8c1b96a4c0a4b8c50b32a8c64f", // USDC Ethereum
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT (Avalanche or other)
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC Avalanche
        "0xc7198437980c041c805a1edcba50c1ce5db95118", // USDT.e Avalanche
        "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", // USDC.e Avalanche
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC Polygon
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT Polygon
      ];
      return commonSixDecimalTokens.some(token => address.toLowerCase() === token.toLowerCase())
        ? 6
        : 18;
    };

    const inputTokenDecimals = getTokenDecimals(tokenInAddress);
    const outputTokenDecimals = getTokenDecimals(tokenOutAddress);

    // Prepare trade parameters using proper SDK format
    const tradeParameters: TradeParameters = {
      kind: OrderKind.SELL,
      sellToken: tokenInAddress,
      sellTokenDecimals: inputTokenDecimals,
      buyToken: tokenOutAddress,
      buyTokenDecimals: outputTokenDecimals,
      amount: formattedAmount,
      slippageBps: args.slippageBps ?? 50,
      validFor: args.validitySeconds ?? 3600,
    };

    const quoterParameters = {
      chainId: currentChainId as SupportedChainId,
      appCode: "0xGasless Agentkit",
      account: userAddress,
    };

    console.log("Getting quote from CowSwap using Trading SDK...");
    const { result } = await getQuote(tradeParameters, quoterParameters);

    console.log("Quote received:", {
      sellAmount: result.quoteResponse.quote.sellAmount,
      buyAmount: result.quoteResponse.quote.buyAmount,
      feeAmount: result.quoteResponse.quote.feeAmount,
    });

    // Calculate display amounts using the quote results
    const expectedOutputAmount = (
      Number(result.quoteResponse.quote.buyAmount) / Math.pow(10, outputTokenDecimals)
    ).toFixed(6);
    const feeAmount = (
      Number(result.quoteResponse.quote.feeAmount) / Math.pow(10, inputTokenDecimals)
    ).toFixed(6);
    const effectivePrice = (
      Number(result.quoteResponse.quote.buyAmount) / Number(result.quoteResponse.quote.sellAmount)
    ).toFixed(8);

    // Check token allowance requirements (for information purposes)
    const cowProtocolVaultRelayer = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
    const approvalRequired =
      tokenInAddress !== "0x0000000000000000000000000000000000000000" &&
      tokenInAddress !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    // Calculate validity end time
    const validUntil = new Date(Date.now() + (args.validitySeconds ?? 3600) * 1000).toISOString();

    return `CowSwap Quote Retrieved Successfully!

Quote Details:
- Input: ${args.amount} ${args.tokenInSymbol || tokenInAddress}
- Expected Output: ~${expectedOutputAmount} ${args.tokenOutSymbol || tokenOutAddress}
- Protocol Fee: ${feeAmount} ${args.tokenInSymbol || tokenInAddress}
- Effective Price: ${effectivePrice} ${args.tokenOutSymbol || "output tokens"} per ${args.tokenInSymbol || "input token"}
- Slippage Tolerance: ${(args.slippageBps ?? 50) / 100}%
- Valid Until: ${validUntil}

${approvalRequired ? `⚠️  Token Approval Required: You need to approve ${tokenInAddress} for the CowSwap Vault Relayer (${cowProtocolVaultRelayer}) before executing this trade.` : ""}

💡 This is a quote only. To execute the actual swap:
1. Ensure sufficient balance of ${args.tokenInSymbol || tokenInAddress}
2. ${approvalRequired ? "Approve the token for CowSwap if not already done" : "No approval needed for native tokens"}
3. Submit the order to CowSwap's batch auction system
4. Wait for batch execution (typically a few minutes)

CowSwap Explorer: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}

Note: This quote is valid for ${(args.validitySeconds ?? 3600) / 60} minutes. Actual execution depends on finding matches in CowSwap's batch auction system, which provides MEV protection and potentially better prices than traditional AMMs.`;
  } catch (error) {
    console.error("Error in CowSwap quote:", error);
    return `Error getting CowSwap quote: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CowSwapSwapAction implements AgentkitAction<typeof CowSwapSwapInput> {
  public name = "cowswap_quote";
  public description = COWSWAP_SWAP_PROMPT;
  public argsSchema = CowSwapSwapInput;
  public func = cowSwapSwap;
  public smartAccountRequired = true;
}
