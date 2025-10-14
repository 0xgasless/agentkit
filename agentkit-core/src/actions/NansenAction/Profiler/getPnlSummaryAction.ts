import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PNL_SUMMARY_PROMPT = `
Retrieve profit and loss summary for a specific wallet address across multiple blockchains. This endpoint provides aggregated PnL information including total gains/losses, win rates, and performance metrics.

Key Features:
- Profit and loss summary for a specific wallet
- Multi-chain support
- Aggregated PnL information
- Win rates and performance metrics
- Comprehensive trading performance analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting PnL summary data.
 */
export const GetPnlSummaryInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get PnL summary for"),

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
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        token_sectors: z.array(z.string()).optional().describe("Token sectors filter"),
        pnl_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("PnL range filter in USD"),
        win_rate: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Win rate range filter (0-1)"),
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
              "token_symbol",
              "token_sectors",
              "pnl_usd",
              "win_rate",
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
  .describe("Instructions for getting PnL summary data");

/**
 * Response interface for PnL summary data.
 */
interface PnlSummary {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  pnl_usd?: number;
  win_rate: number;
  timestamp: string;
}

interface PnlSummaryResponse {
  data: PnlSummary[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches PnL summary data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the PnL summary data.
 */
export async function getPnlSummary(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPnlSummaryInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      wallet_address: args.wallet_address,
      chains: args.chains,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/pnl-summary", {
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
      return `Error fetching PnL summary: ${response.status} ${response.statusText}`;
    }

    const data: PnlSummaryResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No PnL summary found for wallet ${args.wallet_address}.`;
    }

    let result = `📊 PnL Summary for ${args.wallet_address}:\n\n`;

    data.data.forEach((summary, index) => {
      const timestamp = new Date(summary.timestamp).toLocaleString();
      const pnlEmoji = summary.pnl_usd && summary.pnl_usd >= 0 ? "📈" : "📉";
      const winRateEmoji = summary.win_rate >= 0.6 ? "🎯" : summary.win_rate >= 0.4 ? "⚖️" : "🎲";

      result += `${index + 1}. PnL Summary ${pnlEmoji}\n`;
      result += `   • Token: ${summary.token_symbol} (${summary.token_address})\n`;
      result += `   • Chain: ${summary.chain}\n`;
      if (summary.pnl_usd !== undefined) {
        result += `   • PnL: $${summary.pnl_usd.toLocaleString()}\n`;
      }
      result += `   • Win Rate: ${winRateEmoji} ${(summary.win_rate * 100).toFixed(1)}%\n`;
      if (summary.token_sectors && summary.token_sectors.length > 0) {
        result += `   • Sectors: ${summary.token_sectors.join(", ")}\n`;
      }
      result += `   • Last Updated: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching PnL summary: ${errorMessage}`;
  }
}

/**
 * Get PnL Summary action.
 */
export class GetPnlSummaryAction implements AgentkitAction<typeof GetPnlSummaryInput> {
  public name = "get_pnl_summary";
  public description = GET_PNL_SUMMARY_PROMPT;
  public argsSchema = GetPnlSummaryInput;
  public func = getPnlSummary;
  public smartAccountRequired = false;
}
