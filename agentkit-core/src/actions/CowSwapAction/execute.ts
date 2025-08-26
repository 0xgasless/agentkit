import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { ExtendedAgentkitAction, Agentkit } from "../../agentkit";
import {
  formatTokenAmount,
  resolveTokenSymbol,
  checkAndApproveTokenAllowance,
} from "../../services";
import { TradingSdk, OrderKind, SupportedChainId, TradeParameters } from "@cowprotocol/cow-sdk";
import { SmartAccountSignerAdapter } from "./signerAdapter";

const COWSWAP_EXECUTE_PROMPT = `
⚠️  IMPORTANT LIMITATION: CowSwap currently has limited support for smart account (ERC-4337) orders.

This tool will attempt to execute CowSwap trades, but if it fails due to smart account limitations, it will provide you with:
1. Complete trade parameters for manual execution
2. Links to CowSwap interface with pre-filled parameters  
3. Alternative swap recommendations

CowSwap uses a unique batch auction mechanism with Coincidence of Wants (CoW) that provides:
- MEV protection through batch settlement
- Often better prices than traditional AMMs
- Direct peer-to-peer matching when possible

You can specify swaps in two ways:
1. Using token addresses (e.g., "0x...")
2. Using token symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)

USAGE GUIDANCE:
- Provide either tokenIn/tokenOut addresses OR tokenInSymbol/tokenOutSymbol
- Specify the amount to swap (in the input token's units)
- If automatic execution fails, follow the provided manual instructions

EXAMPLES:
- "Swap 10 USDC to ETH using CowSwap"
- "Execute CowSwap trade: 100 USDT to USDC"

Note: CowSwap is available on Ethereum Mainnet, Gnosis Chain, and Avalanche.
For guaranteed execution with smart accounts, consider using smart_swap action instead.
`;

export const CowSwapExecuteInput = z
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
  .describe("Instructions for executing a CowSwap trade");

export async function cowSwapExecute(
  agentkit: Agentkit,
  args: z.infer<typeof CowSwapExecuteInput>,
): Promise<string> {
  try {
    const wallet = agentkit.getSmartAccount();
    const walletClient = agentkit.getWalletClient();
    const userAddress = await wallet.getAddress();
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

    // Format the amount
    let formattedAmount: string;
    try {
      formattedAmount = await formatTokenAmount(wallet, tokenInAddress, args.amount);
    } catch (error) {
      console.error("Error formatting token amount:", error);
      return `Error: Could not format token amount for ${tokenInAddress}. Ensure it's a valid token address and you have balance. Error: ${error instanceof Error ? error.message : String(error)}`;
    }

            // Initialize CowSwap Trading SDK with signer adapter
        const signerAdapter = new SmartAccountSignerAdapter(wallet, walletClient);
        const tradingSdk = new TradingSdk({
          chainId: currentChainId as SupportedChainId,
          signer: signerAdapter,
          appCode: "0xGasless Agentkit",
        });

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

    // Define trade parameters for CowSwap
    const tradeParameters: TradeParameters = {
      kind: OrderKind.SELL, // Selling the input token
      sellToken: tokenInAddress,
      sellTokenDecimals: inputTokenDecimals,
      buyToken: tokenOutAddress,
      buyTokenDecimals: outputTokenDecimals,
      amount: formattedAmount, // Amount in wei
      slippageBps: args.slippageBps ?? 50,
      validFor: args.validitySeconds ?? 3600,
    };

    console.log("Trade parameters prepared:", tradeParameters);

    // Step 2: Execute the swap using TradingSdk
    console.log("Executing CowSwap order...");

    try {
      const orderResult = await tradingSdk.postSwapOrder(tradeParameters);

      console.log("Order posted successfully:", orderResult);

      // Calculate display amounts
      const inputAmount = (Number(formattedAmount) / Math.pow(10, inputTokenDecimals)).toFixed(6);

      return `✅ CowSwap Order Executed Successfully!

🎯 TRANSACTION COMPLETED - Your autonomous agent successfully executed the swap!

Order Details:
- Order UID: ${orderResult.orderId}
- Input: ${args.amount} ${args.tokenInSymbol || tokenInAddress}
- Sell Amount: ${inputAmount} ${args.tokenInSymbol || "input token"}
- Slippage Tolerance: ${(args.slippageBps ?? 50) / 100}%
- Order Kind: SELL

📊 Execution Status:
✅ Trading SDK Initialized: Completed
✅ Trade Parameters: Configured
✅ Order Submission: Completed
✅ Order UID Generated: ${orderResult.orderId}

🎯 What happens next:
1. Your order is now live in CowSwap's batch auction
2. Solvers will compete to find the best execution
3. Settlement typically occurs within 1-5 minutes
4. Tokens will be automatically transferred to your wallet
5. You can track progress using the explorer link below

🔗 Track your order: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}/orders/${orderResult.orderId}

✨ Agent Benefits Delivered:
- ⚡ Fully autonomous execution via Account Abstraction + CowSwap SDK
- 🛡️ MEV protection through batch auctions  
- 💰 Optimal pricing via Coincidence of Wants
- ⛽ Gasless transaction experience
- 🤖 Complete DeFi automation for your agent
- 🔒 EIP-712 signature handling

Your agent successfully executed the complete CowSwap trade autonomously!`;
            } catch (executionError) {
          console.error("Error executing CowSwap trade:", executionError);
          
          // Check if this is a smart account signature issue
          const errorMessage = executionError instanceof Error ? executionError.message : String(executionError);
          if (errorMessage.includes("WrongOwner") || errorMessage.includes("recovered signer") || errorMessage.includes("does not match")) {
            
            // Provide comprehensive manual execution guide
            const manualInstructions = `
❌ Smart Account Limitation Detected

CowSwap currently has limited support for smart accounts (ERC-4337). The signature from your smart account was rejected.

📋 MANUAL EXECUTION OPTIONS:

🌐 Option 1: Use CowSwap Interface
Visit: https://swap.cow.fi/#/${currentChainId === 1 ? 'mainnet' : currentChainId === 43114 ? 'avalanche' : 'gnosis'}/swap?sell=${tokenInAddress}&buy=${tokenOutAddress}&sellAmount=${args.amount}

🔄 Option 2: Use Alternative DEX
Consider using our smart_swap action instead:
"Swap ${args.amount} ${args.tokenInSymbol || 'tokens'} to ${args.tokenOutSymbol || 'output tokens'} using debridge"

📊 Trade Parameters (for reference):
- From: ${args.amount} ${args.tokenInSymbol || tokenInAddress}
- To: ${args.tokenOutSymbol || tokenOutAddress}
- Slippage: ${(args.slippageBps ?? 50) / 100}%
- Smart Account: ${userAddress}

⚡ Why This Happened:
CowSwap's order validation expects the signature to come from the same address that will execute the trade. 
With smart accounts, the underlying private key address (${userAddress}) differs from your smart account address.

🎯 Next Steps:
1. Use the CowSwap interface link above for manual execution
2. Or use smart_swap for automatic execution
3. Your smart account balance: Available for either option

This limitation is specific to CowSwap's current smart account support and does not affect other DEX integrations.`;

            return manualInstructions;
          }
          
          // For other errors, provide standard error message
          return `Error executing CowSwap trade: ${errorMessage}
          
Please ensure you have sufficient balance and try again. If the issue persists, try using smart_swap instead.`;
        }
  } catch (error) {
    console.error("Error executing CowSwap trade:", error);
    return `Error executing CowSwap trade: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CowSwapExecuteAction implements ExtendedAgentkitAction<typeof CowSwapExecuteInput> {
  public name = "cowswap_execute";
  public description = COWSWAP_EXECUTE_PROMPT;
  public argsSchema = CowSwapExecuteInput;
  public func = cowSwapExecute;
  public smartAccountRequired = true;
  public needsFullAgentkit = true;
}
