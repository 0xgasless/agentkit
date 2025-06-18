import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TOKEN_ORDERS_PROMPT = `
Checks orders paid for a specific token from DexScreener API.

This tool retrieves information about paid orders for a token including:
- Order type (tokenProfile, communityTakeover, tokenAd, trendingBarAd)
- Order status (processing, cancelled, on-hold, approved, rejected)
- Payment timestamp

Requires:
- chainId: The blockchain chain identifier (e.g., "solana", "ethereum", "bsc")
- tokenAddress: The token contract address

This endpoint has a rate limit of 60 requests per minute.
`;

/**
 * Input schema for getting token orders.
 */
export const GetTokenOrdersInput = z
  .object({
    chainId: z.string().describe("The blockchain chain identifier (e.g., solana, ethereum, bsc)"),
    tokenAddress: z.string().describe("The token contract address"),
  })
  .strip()
  .describe("Get orders paid for a specific token from DexScreener");

/**
 * Response interface for token order data.
 */
interface TokenOrder {
  type: "tokenProfile" | "communityTakeover" | "tokenAd" | "trendingBarAd";
  status: "processing" | "cancelled" | "on-hold" | "approved" | "rejected";
  paymentTimestamp: number;
}

/**
 * Checks orders paid for a specific token from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chainId and tokenAddress.
 * @returns A formatted string containing the token orders information.
 */
export async function getTokenOrders(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTokenOrdersInput>,
): Promise<string> {
  try {
    const { chainId, tokenAddress } = args;

    // Validate inputs
    if (!chainId || !tokenAddress) {
      return "Error: Both chainId and tokenAddress are required.";
    }

    const url = `https://api.dexscreener.com/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return `No orders found for token ${tokenAddress} on chain ${chainId}.`;
      }
      return `Error fetching token orders: ${response.status} ${response.statusText}`;
    }

    const data: TokenOrder[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return `No orders found for token ${tokenAddress} on chain ${chainId}.`;
    }

    let result = `📋 Orders for Token ${tokenAddress} on ${chainId}:\n\n`;

    data.forEach((order, index) => {
      result += `${index + 1}. ${getOrderTypeEmoji(order.type)} Order\n`;
      result += `   • Type: ${formatOrderType(order.type)}\n`;
      result += `   • Status: ${getStatusEmoji(order.status)} ${formatOrderStatus(order.status)}\n`;
      result += `   • Payment Time: ${formatTimestamp(order.paymentTimestamp)}\n`;
      result += "\n";
    });

    result += `Total Orders: ${data.length}`;

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching token orders: ${errorMessage}`;
  }
}

/**
 * Helper function to get emoji for order type.
 */
function getOrderTypeEmoji(type: string): string {
  switch (type) {
    case "tokenProfile":
      return "👤";
    case "communityTakeover":
      return "🏢";
    case "tokenAd":
      return "📢";
    case "trendingBarAd":
      return "📊";
    default:
      return "📋";
  }
}

/**
 * Helper function to format order type.
 */
function formatOrderType(type: string): string {
  switch (type) {
    case "tokenProfile":
      return "Token Profile";
    case "communityTakeover":
      return "Community Takeover";
    case "tokenAd":
      return "Token Ad";
    case "trendingBarAd":
      return "Trending Bar Ad";
    default:
      return type;
  }
}

/**
 * Helper function to get emoji for order status.
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "approved":
      return "✅";
    case "processing":
      return "⏳";
    case "rejected":
      return "❌";
    case "cancelled":
      return "🚫";
    case "on-hold":
      return "⏸️";
    default:
      return "❓";
  }
}

/**
 * Helper function to format order status.
 */
function formatOrderStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ");
}

/**
 * Helper function to format timestamp.
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get Token Orders action.
 */
export class GetTokenOrdersAction implements AgentkitAction<typeof GetTokenOrdersInput> {
  public name = "get_token_orders";
  public description = GET_TOKEN_ORDERS_PROMPT;
  public argsSchema = GetTokenOrdersInput;
  public func = getTokenOrders;
  public smartAccountRequired = false;
}
