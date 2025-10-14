import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_DEX_TRADES_PROMPT = `
Retrieve DEX trading activity for a specific token across multiple blockchains. This endpoint provides detailed information about decentralized exchange trades including trader information, amounts, and transaction details.

Key Features:
- DEX trading activity for a specific token
- Multi-chain support
- Trader information and labels
- Trade amounts and values
- Comprehensive DEX trading analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting DEX trades data.
 */
export const GetDexTradesInput = z
  .object({
    token_address: z.string().describe("The token address to get DEX trades for"),

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
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_label: z.string().optional().describe("Trader label filter"),
        trader_type: z.array(z.string()).optional().describe("Trader type filter"),
        dex_name: z.string().optional().describe("DEX name filter"),
        token_bought_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Token bought amount range filter"),
        token_sold_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Token sold amount range filter"),
        trade_value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Trade value range filter in USD"),
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
              "trader_address",
              "trader_label",
              "trader_type",
              "dex_name",
              "token_bought_amount",
              "token_sold_amount",
              "trade_value_usd",
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
  .describe("Instructions for getting DEX trades data");

/**
 * Response interface for DEX trades data.
 */
interface DexTrade {
  chain: string;
  token_address: string;
  transaction_hash: string;
  trader_address: string;
  trader_label: string;
  trader_type: string;
  dex_name: string;
  token_bought_amount?: number;
  token_sold_amount?: number;
  trade_value_usd?: number;
  timestamp: string;
}

interface DexTradesResponse {
  data: DexTrade[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches DEX trades data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the DEX trades data.
 */
export async function getDexTrades(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetDexTradesInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/dex-trades", {
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
      return `Error fetching DEX trades: ${response.status} ${response.statusText}`;
    }

    const data: DexTradesResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No DEX trades found for token ${args.token_address}.`;
    }

    let result = `🔄 DEX Trades for ${args.token_address}:\n\n`;

    data.data.forEach((trade, index) => {
      const timestamp = new Date(trade.timestamp).toLocaleString();
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

      result += `${index + 1}. DEX Trade ${typeEmoji}\n`;
      result += `   • Trader: ${trade.trader_label || trade.trader_address}\n`;
      result += `   • Type: ${trade.trader_type}\n`;
      result += `   • DEX: ${trade.dex_name}\n`;
      result += `   • Chain: ${trade.chain}\n`;
      if (trade.token_bought_amount) {
        result += `   • Bought: ${trade.token_bought_amount.toFixed(6)}\n`;
      }
      if (trade.token_sold_amount) {
        result += `   • Sold: ${trade.token_sold_amount.toFixed(6)}\n`;
      }
      if (trade.trade_value_usd) {
        result += `   • Value: $${trade.trade_value_usd.toLocaleString()}\n`;
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
    return `Error fetching DEX trades: ${errorMessage}`;
  }
}

/**
 * Get DEX Trades action.
 */
export class GetDexTradesAction implements AgentkitAction<typeof GetDexTradesInput> {
  public name = "get_dex_trades";
  public description = GET_DEX_TRADES_PROMPT;
  public argsSchema = GetDexTradesInput;
  public func = getDexTrades;
  public smartAccountRequired = false;
}
