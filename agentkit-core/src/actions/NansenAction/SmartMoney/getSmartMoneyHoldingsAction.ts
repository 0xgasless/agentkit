import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_SMART_MONEY_HOLDINGS_PROMPT = `
Retrieve aggregated token balances held by smart traders and funds across multiple blockchains. This endpoint provides insights into what tokens are being accumulated by sophisticated market participants, excluding whales, large holders, and influencers to focus specifically on trading expertise.

Key Features:
- Aggregated balances (not per-wallet breakdowns)
- 24-hour balance change tracking updated in realtime
- Sector categorization for tokens
- Focus on trading expertise rather than size

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting smart money holdings data.
 */
export const GetSmartMoneyHoldingsInput = z
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
        ])
      )
      .describe("Chains to include in the analysis (only smart money supported chains). Use 'all' to include all available chains."),

    filters: z
      .object({
        include_smart_money_labels: z
          .array(z.enum(["Fund", "Smart Trader", "30D Smart Trader", "90D Smart Trader", "180D Smart Trader"]))
          .optional()
          .describe("Smart money category filters to include"),
        exclude_smart_money_labels: z
          .array(z.enum(["Fund", "Smart Trader", "30D Smart Trader", "90D Smart Trader", "180D Smart Trader"]))
          .optional()
          .describe("Smart money category filters to exclude"),
        include_stablecoins: z.boolean().optional().default(false).describe("Whether to include stablecoins in the results"),
        include_native_tokens: z.boolean().optional().default(false).describe("Whether to include native tokens (e.g., ETH, SOL) in the results"),
        value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Value range filter in USD"),
        balance_24h_percent_change: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("24-hour balance change percentage range filter"),
        holders_count: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Number of holders range filter"),
        share_of_holdings_percent: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Share of holdings percentage range filter"),
        token_age_days: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Token age range filter in days"),
        market_cap_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Market cap range filter in USD"),
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        token_sectors: z.array(z.string()).optional().describe("Token sectors filter"),
      })
      .optional()
      .describe("Additional filters to apply"),

    pagination: z
      .object({
        page: z.number().min(1).default(1).describe("Page number (1-based)"),
        per_page: z.number().min(1).max(1000).default(10).describe("Number of records per page (max 1000)"),
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
              "token_symbol",
              "value_usd",
              "balance_24h_percent_change",
              "holders_count",
              "share_of_holdings_percent",
              "token_age_days",
              "market_cap_usd",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        })
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting smart money holdings data");

/**
 * Response interface for smart money holdings data.
 */
interface SmartMoneyHolding {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  value_usd?: number;
  balance_24h_percent_change?: number;
  holders_count: number;
  share_of_holdings_percent?: number;
  token_age_days: number;
  market_cap_usd?: number;
}

interface SmartMoneyHoldingsResponse {
  data: SmartMoneyHolding[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches smart money holdings data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the smart money holdings data.
 */
export async function getSmartMoneyHoldings(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetSmartMoneyHoldingsInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/smart-money/holdings", {
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
      return `Error fetching smart money holdings: ${response.status} ${response.statusText}`;
    }

    const data: SmartMoneyHoldingsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return "No smart money holdings data found matching your criteria.";
    }

    let result = "💼 Smart Money Holdings Analysis:\n\n";

    data.data.forEach((item, index) => {
      result += `${index + 1}. ${item.token_symbol} (${item.chain})\n`;
      result += `   • Token Address: ${item.token_address}\n`;
      if (item.value_usd) {
        result += `   • Total Value: $${item.value_usd.toLocaleString()}\n`;
      }
      if (item.balance_24h_percent_change !== undefined) {
        const changeEmoji = item.balance_24h_percent_change >= 0 ? "📈" : "📉";
        result += `   • 24h Change: ${changeEmoji} ${item.balance_24h_percent_change.toFixed(2)}%\n`;
      }
      result += `   • Smart Money Holders: ${item.holders_count}\n`;
      if (item.share_of_holdings_percent !== undefined) {
        result += `   • Share of Holdings: ${item.share_of_holdings_percent.toFixed(2)}%\n`;
      }
      result += `   • Token Age: ${item.token_age_days} days\n`;
      if (item.market_cap_usd) {
        result += `   • Market Cap: $${item.market_cap_usd.toLocaleString()}\n`;
      }
      if (item.token_sectors && item.token_sectors.length > 0) {
        result += `   • Sectors: ${item.token_sectors.join(", ")}\n`;
      }
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching smart money holdings: ${errorMessage}`;
  }
}

/**
 * Get Smart Money Holdings action.
 */
export class GetSmartMoneyHoldingsAction implements AgentkitAction<typeof GetSmartMoneyHoldingsInput> {
  public name = "get_smart_money_holdings";
  public description = GET_SMART_MONEY_HOLDINGS_PROMPT;
  public argsSchema = GetSmartMoneyHoldingsInput;
  public func = getSmartMoneyHoldings;
  public smartAccountRequired = false;
}
