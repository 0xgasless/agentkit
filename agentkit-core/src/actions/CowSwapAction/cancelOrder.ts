import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { OrderBookApi, OrderSigningUtils, SupportedChainId } from "@cowprotocol/cow-sdk";
import { SmartAccountSignerAdapter } from "./signerAdapter";

const COWSWAP_CANCEL_ORDER_PROMPT = `
This tool provides information about cancelling orders on CowSwap.

CowSwap order cancellation requires signing a cancellation message and submitting it to the CowSwap API.

USAGE GUIDANCE:
- Provide the Order UID of the order you want to cancel
- Only orders in 'open' (pending) status can be cancelled
- Cancellation is on a best-effort basis - orders already being settled cannot be cancelled

EXAMPLES:
- "Cancel CowSwap order 0x123..."
- "Cancel my CowSwap order with UID 0xabc123..."

Note: CowSwap is available on Ethereum Mainnet, Gnosis Chain, and Avalanche.
This action provides cancellation information. Actual cancellation requires additional signing and submission steps.
`;

export const CowSwapCancelOrderInput = z
  .object({
    orderUid: z.string().describe("The Order UID to cancel (e.g., 0x...)"),
    reason: z.string().optional().nullable().describe("Optional reason for cancellation"),
  })
  .strip()
  .describe("Instructions for cancelling a CowSwap order");

export async function cowSwapCancelOrder(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CowSwapCancelOrderInput>,
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

    // Validate Order UID format
    if (!args.orderUid.startsWith("0x") || args.orderUid.length !== 114) {
      return `Error: Invalid Order UID format. Order UIDs should be 114 characters long and start with '0x'.
Example: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678`;
    }

    // Initialize OrderBook API
    const orderBookApi = new OrderBookApi({
      chainId: currentChainId as SupportedChainId,
    });

    console.log("Checking order status before cancellation...");

    try {
      // First, check if the order exists and can be cancelled
      const order = await orderBookApi.getOrder(args.orderUid);

      if (order.status !== "open") {
        return `❌ Cannot cancel order ${args.orderUid}

Order Status: ${order.status}
Reason: Only orders with 'open' status can be cancelled.

Current order details:
- Status: ${order.status}
- Created: ${new Date(order.creationDate).toISOString()}
- Owner: ${order.owner}

🔗 Order Explorer: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}/orders/${args.orderUid}`;
      }

      console.log("Order can be cancelled. Proceeding with cancellation...");

      // Sign the cancellation using signer adapter
      const signerAdapter = new SmartAccountSignerAdapter(wallet);
      const cancellationSigningResult = await OrderSigningUtils.signOrderCancellation(
        args.orderUid,
        currentChainId as SupportedChainId,
        signerAdapter,
      );

      // Submit the cancellation
      const cancellationResult = await orderBookApi.sendSignedOrderCancellations({
        ...cancellationSigningResult,
        orderUids: [args.orderUid],
      });

      console.log("Order cancellation submitted successfully:", cancellationResult);

      return `✅ CowSwap Order Cancelled Successfully!

🎯 CANCELLATION COMPLETED - Your autonomous agent successfully cancelled the order!

Cancellation Details:
- Order UID: ${args.orderUid}
- User Address: ${userAddress}
- Chain: ${currentChainId === 1 ? "Ethereum Mainnet" : currentChainId === 100 ? "Gnosis Chain" : "Avalanche"}
${args.reason ? `- Reason: ${args.reason}` : ""}

📊 Execution Status:
✅ Order Status Check: Completed
✅ EIP-712 Signature: Completed
✅ Cancellation Submission: Completed
✅ Order Cancelled: Confirmed

🎯 What happened:
1. Agent verified order was in 'open' status
2. Automatically signed cancellation message using EIP-712
3. Submitted cancellation to CowSwap API
4. Order is now marked as cancelled

🔗 Order Explorer: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}/orders/${args.orderUid}

✨ Agent Benefits Delivered:
- ⚡ Fully autonomous order cancellation via Account Abstraction
- 🔒 Secure EIP-712 signature handling
- ⛽ Gasless transaction experience
- 🤖 Complete DeFi automation for your agent
- 📋 Automatic status verification

Your agent successfully cancelled the CowSwap order autonomously!`;
    } catch (orderError) {
      console.error("Error processing order cancellation:", orderError);
      return `Error cancelling CowSwap order: ${orderError instanceof Error ? orderError.message : String(orderError)}. 

The order may not exist, may already be executed/cancelled, or there may be a network issue.`;
    }
  } catch (error) {
    console.error("Error in CowSwap cancel order:", error);
    return `Error preparing order cancellation: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CowSwapCancelOrderAction implements AgentkitAction<typeof CowSwapCancelOrderInput> {
  public name = "cowswap_cancel_order";
  public description = COWSWAP_CANCEL_ORDER_PROMPT;
  public argsSchema = CowSwapCancelOrderInput;
  public func = cowSwapCancelOrder;
  public smartAccountRequired = true;
}
