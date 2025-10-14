import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_WHO_BOUGHT_SOLD_PROMPT = `
Retrieve information about who bought and sold a specific token across multiple blockchains. This endpoint provides detailed information about buyers and sellers including their labels, amounts, and transaction details.

Key Features:
- Information about who bought and sold a specific token
- Multi-chain support
- Buyer and seller labels and amounts
- Transaction details and timing
- Comprehensive trading activity analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting who bought/sold data.
 */
export const GetWhoBoughtSoldInput = z
  .object({
    token_address: z.string().describe("The token address to get buy/sell data for"),

    chains: z
      .array(
        z.enum([
          "all",
          "arbitrum",
          "avalanche",
          "base",
          "berachain",
          "blast",
          "bnb",
          "ethereum",
          "goat",
          "hyperevm",
          "iotaevm",
          "linea",
          "mantle",
          "optimism",
          "plasma",
          "polygon",
          "ronin",
          "sei",
          "scroll",
          "sonic",
          "unichain",
          "zksync",
          "solana",
        ]),
      )
      .describe("Chains to include in the analysis. Use 'all' to include all available chains."),

    filters: z
      .object({
        transaction_hash: z.string().optional().describe("Transaction hash filter"),
        action_type: z
          .array(z.enum(["buy", "sell"]))
          .optional()
          .describe("Action type filter (buy, sell)"),
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_label: z.string().optional().describe("Trader label filter"),
        trader_type: z.array(z.string()).optional().describe("Trader type filter"),
        amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Amount range filter"),
        value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Value range filter in USD"),
        timestamp: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional()
          .describe("Timestamp range filter"),
      })
      .optional()
      .describe("Additional filters to apply"),

    pagination: z
      .object({
        page: z.number().min(1).default(1).describe("Page number (1-based)"),
        per_page: z
          .number()
          .min(1)
          .max(1000)
          .default(10)
          .describe("Number of records per page (max 1000)"),
      })
      .optional()
      .describe("Pagination parameters"),

    order_by: z
      .array(
        z.object({
          field: z
            .enum([
              "chain",
              "token_address",
              "transaction_hash",
              "action_type",
              "trader_address",
              "trader_label",
              "trader_type",
              "amount",
              "value_usd",
              "timestamp",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        }),
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting who bought/sold data");

/**
 * Response interface for who bought/sold data.
 */
interface WhoBoughtSold {
  chain: string;
  token_address: string;
  transaction_hash: string;
  action_type: string;
  trader_address: string;
  trader_label: string;
  trader_type: string;
  amount: number;
  value_usd?: number;
  timestamp: string;
}

interface WhoBoughtSoldResponse {
  data: WhoBoughtSold[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches who bought/sold data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the who bought/sold data.
 */
export async function getWhoBoughtSold(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetWhoBoughtSoldInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      token_address: args.token_address,
      chains: args.chains,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/who-bought-sold", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: apiKey,
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return "Error: Invalid Nansen API key. Please check your NANSEN_API_KEY environment variable.";
      }
      if (response.status === 403) {
        return "Error: Insufficient subscription tier for this endpoint.";
      }
      if (response.status === 429) {
        return "Error: Rate limit exceeded. Please wait before making another request.";
      }
      return `Error fetching who bought/sold: ${response.status} ${response.statusText}`;
    }

    const data: WhoBoughtSoldResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No buy/sell data found for token ${args.token_address}.`;
    }

    let result = `💰 Who Bought/Sold ${args.token_address}:\n\n`;

    data.data.forEach((trade, index) => {
      const timestamp = new Date(trade.timestamp).toLocaleString();
      const actionEmoji = trade.action_type === "buy" ? "🟢" : "🔴";
      const typeEmoji =
        trade.trader_type === "exchange"
          ? "🏦"
          : trade.trader_type === "defi"
            ? "🔄"
            : trade.trader_type === "smart_money"
              ? "🧠"
              : trade.trader_type === "whale"
                ? "🐋"
                : "👤";

      result += `${index + 1}. Trade ${actionEmoji}\n`;
      result += `   • Action: ${trade.action_type.toUpperCase()}\n`;
      result += `   • Trader: ${typeEmoji} ${trade.trader_label || trade.trader_address}\n`;
      result += `   • Type: ${trade.trader_type}\n`;
      result += `   • Chain: ${trade.chain}\n`;
      result += `   • Amount: ${trade.amount.toFixed(6)}\n`;
      if (trade.value_usd) {
        result += `   • Value: $${trade.value_usd.toLocaleString()}\n`;
      }
      result += `   • Time: ${timestamp}\n`;
      result += `   • Tx Hash: ${trade.transaction_hash}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching who bought/sold: ${errorMessage}`;
  }
}

/**
 * Get Who Bought/Sold action.
 */
export class GetWhoBoughtSoldAction implements AgentkitAction<typeof GetWhoBoughtSoldInput> {
  public name = "get_who_bought_sold";
  public description = GET_WHO_BOUGHT_SOLD_PROMPT;
  public argsSchema = GetWhoBoughtSoldInput;
  public func = getWhoBoughtSold;
  public smartAccountRequired = false;
}
