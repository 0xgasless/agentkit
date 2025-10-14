import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_SMART_MONEY_NETFLOW_PROMPT = `
Analyze net capital flows (inflows vs outflows) from smart traders and funds across different time periods. This endpoint helps identify which tokens are experiencing net accumulation or distribution by smart money.

What are Net Flows?
Net flows represent the difference between smart money inflows and outflows for a token. This includes:
- DEX Trading Activity: Tokens bought vs sold on decentralized exchanges
- CEX Transfers: Tokens sent to or received from centralized exchanges
- Positive Net Flow: Smart money is accumulating (buying more than selling, or withdrawing from CEXs)
- Negative Net Flow: Smart money is distributing (selling more than buying, or depositing to CEXs)

Key Features:
- Aggregated net flow calculations across all smart money activity
- Multiple time period analysis (24h, 7d, 30d)
- Sortable results by volume metrics
- Includes both DEX trades and CEX transfers

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting smart money netflow data.
 */
export const GetSmartMoneyNetflowInput = z
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
        token_address: z.string().optional().describe("Token address or symbol filter"),
        include_stablecoins: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to include stablecoins in the results"),
        include_native_tokens: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to include native tokens (e.g., ETH, SOL) in the results"),
        token_sector: z.array(z.string()).optional().describe("Token sector filter"),
        trader_count: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Trader count range filter"),
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
              "token_symbol",
              "net_flow_24h_usd",
              "net_flow_7d_usd",
              "net_flow_30d_usd",
              "token_sectors",
              "trader_count",
              "token_age_days",
              "market_cap_usd",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        }),
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting smart money netflow data");

/**
 * Response interface for smart money netflow data.
 */
interface SmartMoneyNetflow {
  token_address: string;
  token_symbol: string;
  net_flow_24h_usd: number;
  net_flow_7d_usd: number;
  net_flow_30d_usd: number;
  chain: string;
  token_sectors: string[];
  trader_count: number;
  token_age_days: number;
  market_cap_usd?: number;
}

interface SmartMoneyNetflowResponse {
  data: SmartMoneyNetflow[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches smart money netflow data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the smart money netflow data.
 */
export async function getSmartMoneyNetflow(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetSmartMoneyNetflowInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/smart-money/netflow", {
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
      return `Error fetching smart money netflow: ${response.status} ${response.statusText}`;
    }

    const data: SmartMoneyNetflowResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return "No smart money netflow data found matching your criteria.";
    }

    let result = "📊 Smart Money Netflow Analysis:\n\n";

    data.data.forEach((item, index) => {
      result += `${index + 1}. ${item.token_symbol} (${item.chain})\n`;
      result += `   • Token Address: ${item.token_address}\n`;
      result += `   • Net Flow 24h: $${item.net_flow_24h_usd?.toLocaleString() || "N/A"}\n`;
      result += `   • Net Flow 7d: $${item.net_flow_7d_usd?.toLocaleString() || "N/A"}\n`;
      result += `   • Net Flow 30d: $${item.net_flow_30d_usd?.toLocaleString() || "N/A"}\n`;
      result += `   • Smart Money Traders: ${item.trader_count}\n`;
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
    return `Error fetching smart money netflow: ${errorMessage}`;
  }
}

/**
 * Get Smart Money Netflow action.
 */
export class GetSmartMoneyNetflowAction
  implements AgentkitAction<typeof GetSmartMoneyNetflowInput>
{
  public name = "get_smart_money_netflow";
  public description = GET_SMART_MONEY_NETFLOW_PROMPT;
  public argsSchema = GetSmartMoneyNetflowInput;
  public func = getSmartMoneyNetflow;
  public smartAccountRequired = false;
}
