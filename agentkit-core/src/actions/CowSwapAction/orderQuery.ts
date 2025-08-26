import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { OrderBookApi } from "@cowprotocol/cow-sdk";

const COWSWAP_ORDER_QUERY_PROMPT = `
This tool allows you to query order information from CowSwap.

You can query orders in several ways:
1. By Order UID (unique identifier) - for specific order details
2. By user address - to get all orders for a specific address
3. Get recent orders from the current wallet

USAGE GUIDANCE:
- Provide either an order UID or use the current wallet address
- Get detailed information about order status, fill amounts, and execution
- Check if orders are pending, filled, or cancelled

EXAMPLES:
- "Check CowSwap order status for UID 0x123..."
- "Get my CowSwap orders"
- "Query CowSwap order 0xabc123..."

Note: CowSwap is available on Ethereum Mainnet, Gnosis Chain, and Avalanche.
`;

export const CowSwapOrderQueryInput = z
  .object({
    orderUid: z
      .string()
      .optional()
      .nullable()
      .describe("Specific order UID to query (e.g., 0x...)"),
    userAddress: z
      .string()
      .optional()
      .nullable()
      .describe("User address to get orders for (optional, defaults to current wallet)"),
    limit: z
      .number()
      .optional()
      .nullable()
      .default(10)
      .describe("Maximum number of orders to return (default: 10)"),
  })
  .strip()
  .describe("Instructions for querying CowSwap orders");

export async function cowSwapOrderQuery(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CowSwapOrderQueryInput>,
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

    const walletAddress = await wallet.getAddress();
    const queryAddress = args.userAddress || walletAddress;

    // Initialize CowSwap OrderBook API
    const orderBookApi = new OrderBookApi({
      chainId: currentChainId as 1 | 100 | 43114,
    });

    console.log("Querying CowSwap orders...");

    if (args.orderUid) {
      // Query specific order by UID
      try {
        const order = await orderBookApi.getOrder(args.orderUid);

        const creationTime = new Date(order.creationDate).toISOString();
        const validUntil = new Date(order.validTo * 1000).toISOString();

        return `CowSwap Order Details

Order UID: ${args.orderUid}
Status: ${order.status}
Owner: ${order.owner}

Order Parameters:
- Sell Token: ${order.sellToken}
- Buy Token: ${order.buyToken}
- Kind: ${order.kind} order
- Partially Fillable: ${order.partiallyFillable}

Timing:
- Created: ${creationTime}
- Valid Until: ${validUntil}

🔗 Explorer Link: https://explorer.cow.fi/${currentChainId === 1 ? "mainnet" : currentChainId === 43114 ? "avalanche" : "gnosis"}/orders/${args.orderUid}`;
      } catch (error) {
        return `Error: Could not find order with UID ${args.orderUid}. ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      // Query orders for user address
      try {
        const orders = await orderBookApi.getOrders({
          owner: queryAddress,
          limit: args.limit ?? 10,
          offset: 0,
        });

        if (orders.length === 0) {
          return `No CowSwap orders found for address ${queryAddress}.`;
        }

        let result = `CowSwap Orders for ${queryAddress}:\n\n`;

        orders.forEach((order, index) => {
          const creationTime = new Date(order.creationDate).toISOString();
          result += `${index + 1}. Order ${order.uid.substring(0, 10)}... - Status: ${order.status} - Created: ${creationTime}\n`;
        });

        return result;
      } catch (error) {
        return `Error querying orders: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CowSwapOrderQueryAction implements AgentkitAction<typeof CowSwapOrderQueryInput> {
  public name = "cowswap_order_query";
  public description = COWSWAP_ORDER_QUERY_PROMPT;
  public argsSchema = CowSwapOrderQueryInput;
  public func = cowSwapOrderQuery;
  public smartAccountRequired = true;
}
