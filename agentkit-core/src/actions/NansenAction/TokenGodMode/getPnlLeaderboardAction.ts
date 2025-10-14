import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PNL_LEADERBOARD_PROMPT = `
Retrieve PnL leaderboard data for a specific token across multiple blockchains. This endpoint provides information about the top performers in terms of profit and loss for the token, including their trading performance and metrics.

Key Features:
- PnL leaderboard data for a specific token
- Multi-chain support
- Top performers by profit/loss
- Trading performance metrics
- Comprehensive leaderboard analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting PnL leaderboard data.
 */
export const GetPnlLeaderboardInput = z
  .object({
    token_address: z.string().describe("The token address to get PnL leaderboard for"),

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
      .describe("Chains to include in the analysis. Use 'all' to include all available chains."),

    filters: z
      .object({
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_label: z.string().optional().describe("Trader label filter"),
        trader_type: z.array(z.string()).optional().describe("Trader type filter"),
        pnl_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("PnL range filter in USD"),
        pnl_percent: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("PnL percentage range filter"),
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
              "trader_address",
              "trader_label",
              "trader_type",
              "pnl_usd",
              "pnl_percent",
              "win_rate",
              "timestamp",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        })
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting PnL leaderboard data");

/**
 * Response interface for PnL leaderboard data.
 */
interface PnlLeaderboard {
  chain: string;
  token_address: string;
  trader_address: string;
  trader_label: string;
  trader_type: string;
  pnl_usd?: number;
  pnl_percent?: number;
  win_rate: number;
  timestamp: string;
}

interface PnlLeaderboardResponse {
  data: PnlLeaderboard[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches PnL leaderboard data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the PnL leaderboard data.
 */
export async function getPnlLeaderboard(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPnlLeaderboardInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/pnl-leaderboard", {
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
      return `Error fetching PnL leaderboard: ${response.status} ${response.statusText}`;
    }

    const data: PnlLeaderboardResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No PnL leaderboard data found for token ${args.token_address}.`;
    }

    let result = `🏆 PnL Leaderboard for ${args.token_address}:\n\n`;

    data.data.forEach((trader, index) => {
      const timestamp = new Date(trader.timestamp).toLocaleString();
      const rankEmoji = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅";
      const pnlEmoji = trader.pnl_usd && trader.pnl_usd >= 0 ? "📈" : "📉";
      const typeEmoji = trader.trader_type === "exchange" ? "🏦" : 
                       trader.trader_type === "defi" ? "🔄" : 
                       trader.trader_type === "smart_money" ? "🧠" : 
                       trader.trader_type === "whale" ? "🐋" : "👤";
      
      result += `${index + 1}. ${rankEmoji} Trader ${pnlEmoji}\n`;
      result += `   • Trader: ${typeEmoji} ${trader.trader_label || trader.trader_address}\n`;
      result += `   • Type: ${trader.trader_type}\n`;
      result += `   • Chain: ${trader.chain}\n`;
      if (trader.pnl_usd !== undefined) {
        result += `   • PnL: $${trader.pnl_usd.toLocaleString()}\n`;
      }
      if (trader.pnl_percent !== undefined) {
        result += `   • PnL %: ${trader.pnl_percent.toFixed(2)}%\n`;
      }
      result += `   • Win Rate: ${(trader.win_rate * 100).toFixed(1)}%\n`;
      result += `   • Last Updated: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching PnL leaderboard: ${errorMessage}`;
  }
}

/**
 * Get PnL Leaderboard action.
 */
export class GetPnlLeaderboardAction implements AgentkitAction<typeof GetPnlLeaderboardInput> {
  public name = "get_pnl_leaderboard";
  public description = GET_PNL_LEADERBOARD_PROMPT;
  public argsSchema = GetPnlLeaderboardInput;
  public func = getPnlLeaderboard;
  public smartAccountRequired = false;
}
