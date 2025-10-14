import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_SMART_MONEY_DEX_TRADES_PROMPT = `
Access real-time DEX trading activity from smart traders and funds over the last 24 hours. This endpoint provides granular transaction-level data showing exactly what sophisticated traders are buying and selling on decentralized exchanges.

Key Features:
- Real-time DEX trading activity from smart traders and funds
- Last 24 hours of trading data
- Granular transaction-level information
- Shows exactly what sophisticated traders are buying and selling
- Detailed trade information including amounts, prices, and timing

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting smart money DEX trades data.
 */
export const GetSmartMoneyDexTradesInput = z
  .object({
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
      .describe(
        "Chains to include in the analysis (only smart money supported chains). Use 'all' to include all available chains.",
      ),

    filters: z
      .object({
        include_smart_money_labels: z
          .array(
            z.enum([
              "Fund",
              "Smart Trader",
              "30D Smart Trader",
              "90D Smart Trader",
              "180D Smart Trader",
            ]),
          )
          .optional()
          .describe("Smart money category filters to include"),
        exclude_smart_money_labels: z
          .array(
            z.enum([
              "Fund",
              "Smart Trader",
              "30D Smart Trader",
              "90D Smart Trader",
              "180D Smart Trader",
            ]),
          )
          .optional()
          .describe("Smart money category filters to exclude"),
        chain: z.string().optional().describe("Blockchain network filter"),
        transaction_hash: z.string().optional().describe("Transaction hash filter"),
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_address_label: z.string().optional().describe("Trader name or label filter"),
        token_bought_address: z
          .string()
          .optional()
          .describe("Token address filter for bought tokens"),
        token_sold_address: z.string().optional().describe("Token address filter for sold tokens"),
        token_bought_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Amount range filter for bought tokens"),
        token_sold_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Amount range filter for sold tokens"),
        token_bought_symbol: z.string().optional().describe("Symbol filter for bought tokens"),
        token_sold_symbol: z.string().optional().describe("Symbol filter for sold tokens"),
        token_bought_age_days: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Age range filter for bought tokens in days"),
        token_sold_age_days: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Age range filter for sold tokens in days"),
        token_bought_market_cap: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Market cap range filter for bought tokens"),
        token_sold_market_cap: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Market cap range filter for sold tokens"),
        trade_value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Trade value range filter in USD"),
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
              "block_timestamp",
              "transaction_hash",
              "trader_address",
              "trader_address_label",
              "token_bought_address",
              "token_sold_address",
              "token_bought_amount",
              "token_sold_amount",
              "token_bought_symbol",
              "token_sold_symbol",
              "token_bought_age_days",
              "token_sold_age_days",
              "token_bought_market_cap",
              "token_sold_market_cap",
              "trade_value_usd",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        }),
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting smart money DEX trades data");

/**
 * Response interface for smart money DEX trades data.
 */
interface SmartMoneyDexTrade {
  chain: string;
  block_timestamp: string;
  transaction_hash: string;
  trader_address: string;
  trader_address_label: string;
  token_bought_address: string;
  token_sold_address: string;
  token_bought_amount?: number;
  token_sold_amount?: number;
  token_bought_symbol: string;
  token_sold_symbol: string;
  token_bought_age_days: number;
  token_sold_age_days: number;
  token_bought_market_cap?: number;
  token_sold_market_cap?: number;
  trade_value_usd?: number;
}

interface SmartMoneyDexTradesResponse {
  data: SmartMoneyDexTrade[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches smart money DEX trades data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the smart money DEX trades data.
 */
export async function getSmartMoneyDexTrades(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetSmartMoneyDexTradesInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      chains: args.chains,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/smart-money/dex-trades", {
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
      return `Error fetching smart money DEX trades: ${response.status} ${response.statusText}`;
    }

    const data: SmartMoneyDexTradesResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return "No smart money DEX trades found matching your criteria.";
    }

    let result = "🔄 Smart Money DEX Trades (Last 24h):\n\n";

    data.data.forEach((trade, index) => {
      const timestamp = new Date(trade.block_timestamp).toLocaleString();
      result += `${index + 1}. DEX Trade\n`;
      result += `   • Trader: ${trade.trader_address_label || trade.trader_address}\n`;
      result += `   • Chain: ${trade.chain}\n`;
      result += `   • Time: ${timestamp}\n`;
      result += `   • Trade: ${trade.token_sold_amount?.toFixed(4) || "?"} ${trade.token_sold_symbol} → ${trade.token_bought_amount?.toFixed(4) || "?"} ${trade.token_bought_symbol}\n`;
      if (trade.trade_value_usd) {
        result += `   • Value: $${trade.trade_value_usd.toLocaleString()}\n`;
      }
      result += `   • Tx Hash: ${trade.transaction_hash}\n`;
      result += `   • Token Ages: ${trade.token_sold_symbol} (${trade.token_sold_age_days}d), ${trade.token_bought_symbol} (${trade.token_bought_age_days}d)\n`;
      if (trade.token_bought_market_cap || trade.token_sold_market_cap) {
        result += `   • Market Caps: ${trade.token_sold_symbol} $${trade.token_sold_market_cap?.toLocaleString() || "N/A"}, ${trade.token_bought_symbol} $${trade.token_bought_market_cap?.toLocaleString() || "N/A"}\n`;
      }
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching smart money DEX trades: ${errorMessage}`;
  }
}

/**
 * Get Smart Money DEX Trades action.
 */
export class GetSmartMoneyDexTradesAction
  implements AgentkitAction<typeof GetSmartMoneyDexTradesInput>
{
  public name = "get_smart_money_dex_trades";
  public description = GET_SMART_MONEY_DEX_TRADES_PROMPT;
  public argsSchema = GetSmartMoneyDexTradesInput;
  public func = getSmartMoneyDexTrades;
  public smartAccountRequired = false;
}
