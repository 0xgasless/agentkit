import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { formatTokenAmount, resolveTokenSymbol } from "../../services";
import {
  TradingSdk,
  OrderKind,
  SupportedChainId,
  LimitTradeParameters,
} from "@cowprotocol/cow-sdk";
import { SmartAccountSignerAdapter } from "./signerAdapter";

const COWSWAP_LIMIT_ORDER_PROMPT = `
This tool provides information about creating limit orders on CowSwap.

CowSwap limit orders allow you to specify an exact price at which you want to trade, and the order will only execute when that price is met within the batch auction system.

You can specify limit orders in two ways:
1. Using token addresses (e.g., "0x...")
2. Using token symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)

USAGE GUIDANCE:
- Provide either tokenIn/tokenOut addresses OR tokenInSymbol/tokenOutSymbol
- Specify the amount to sell
- Specify the minimum amount you want to receive (limit price)
- Set the order validity period

EXAMPLES:
- "Create CowSwap limit order to sell 100 USDC for at least 0.06 ETH"
- "Create limit order to sell 1 ETH for at least 1650 USDC, valid for 24 hours"

Note: CowSwap is available on Ethereum Mainnet, Gnosis Chain, and Avalanche.
This action provides limit order information and parameters. Actual order submission requires additional signing and submission steps.
`;

export const CowSwapLimitOrderInput = z
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

    // Amount and limit parameters
    sellAmount: z.string().describe("The amount of input token to sell"),
    minBuyAmount: z
      .string()
      .describe("The minimum amount of output token to receive (sets the limit price)"),

    // Optional parameters
    validityHours: z
      .number()
      .optional()
      .nullable()
      .default(24)
      .describe("Order validity in hours (default: 24 hours)"),
  })
  .strip()
  .describe("Instructions for creating a CowSwap limit order");

export async function cowSwapLimitOrder(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CowSwapLimitOrderInput>,
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

    // Get token decimals for proper amount formatting
    const getTokenDecimals = (address: string): number => {
      const commonSixDecimalTokens = [
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT Ethereum
        "0xa0b86a33e6441c8c1b96a4c0a4b8c50b32a8c64f", // USDC Ethereum
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT Avalanche
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC Avalanche
        "0xc7198437980c041c805a1edcba50c1ce5db95118", // USDT.e Avalanche
        "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", // USDC.e Avalanche
      ];
      return commonSixDecimalTokens.some(token => address.toLowerCase() === token.toLowerCase())
        ? 6
        : 18;
    };

    const inputTokenDecimals = getTokenDecimals(tokenInAddress);
    const outputTokenDecimals = getTokenDecimals(tokenOutAddress);

    // Format the amounts
    let formattedSellAmount: string;
    let formattedMinBuyAmount: string;

    try {
      formattedSellAmount = await formatTokenAmount(wallet, tokenInAddress, args.sellAmount);
      formattedMinBuyAmount = await formatTokenAmount(wallet, tokenOutAddress, args.minBuyAmount);
    } catch (error) {
      console.error("Error formatting token amounts:", error);
      return `Error: Could not format token amounts. Ensure token addresses are valid. Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Initialize CowSwap Trading SDK with signer adapter
    const signerAdapter = new SmartAccountSignerAdapter(wallet);
    const tradingSdk = new TradingSdk({
      chainId: currentChainId as SupportedChainId,
      signer: signerAdapter,
      appCode: "0xGasless Agentkit",
    });

    // Prepare limit order parameters
    const limitOrderParams: LimitTradeParameters = {
      kind: OrderKind.SELL,
      sellToken: tokenInAddress,
      sellTokenDecimals: inputTokenDecimals,
      buyToken: tokenOutAddress,
      buyTokenDecimals: outputTokenDecimals,
      sellAmount: formattedSellAmount,
      buyAmount: formattedMinBuyAmount,
      validTo: Math.floor(Date.now() / 1000) + (args.validityHours ?? 24) * 3600,
    };

    console.log("Creating CowSwap limit order...");

    try {
      const orderResult = await tradingSdk.postLimitOrder(limitOrderParams);

      console.log("Limit order created successfully:", orderResult);

      // Calculate limit price for display
      const limitPrice = Number(args.minBuyAmount) / Number(args.sellAmount);

      return `✅ CowSwap Limit Order Created Successfully!

🎯 LIMIT ORDER EXECUTED - Your autonomous agent successfully created the limit order!

Order Details:
- Order UID: ${orderResult.orderId}
- Sell Token: ${args.tokenInSymbol || tokenInAddress}
- Buy Token: ${args.tokenOutSymbol || tokenOutAddress}
- Sell Amount: ${args.sellAmount} ${args.tokenInSymbol || "tokens"}
- Minimum Buy Amount: ${args.minBuyAmount} ${args.tokenOutSymbol || "tokens"}
- Limit Price: ${limitPrice.toFixed(8)} ${args.tokenOutSymbol || "output tokens"} per ${args.tokenInSymbol || "input token"}
- Valid For: ${args.validityHours ?? 24} hours

📊 Execution Status:
✅ Trading SDK Initialized: Completed
✅ Limit Order Created: Completed
✅ Order Submission: Completed
✅ Order UID Generated: ${orderResult.orderId}

🎯 What happens next:
1. Your limit order is now live in CowSwap's order book
2. It will execute automatically when market price reaches your limit
3. Order remains active until filled, cancelled, or expired
4. MEV protection through CowSwap's batch auction system

🔗 Track your order: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}/orders/${orderResult.orderId}

✨ Agent Benefits Delivered:
- ⚡ Fully autonomous limit order creation via Account Abstraction
- 🛡️ MEV protection through CowSwap batch auctions
- 💰 Price protection with your specified limit
- ⛽ Gasless transaction experience
- 🤖 Complete DeFi automation for your agent
- 📋 Automatic order book submission

Your agent successfully created the CowSwap limit order autonomously!`;
    } catch (executionError) {
      console.error("Error creating CowSwap limit order:", executionError);
      return `Error creating CowSwap limit order: ${executionError instanceof Error ? executionError.message : String(executionError)}. 
      
Please ensure you have sufficient balance and try again.`;
    }
  } catch (error) {
    console.error("Error in CowSwap limit order:", error);
    return `Error creating CowSwap limit order parameters: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CowSwapLimitOrderAction implements AgentkitAction<typeof CowSwapLimitOrderInput> {
  public name = "cowswap_limit_order";
  public description = COWSWAP_LIMIT_ORDER_PROMPT;
  public argsSchema = CowSwapLimitOrderInput;
  public func = cowSwapLimitOrder;
  public smartAccountRequired = true;
}
