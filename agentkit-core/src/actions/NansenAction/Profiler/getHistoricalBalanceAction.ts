import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_HISTORICAL_BALANCE_PROMPT = `
Retrieve historical token balances for a specific wallet address across multiple blockchains. This endpoint provides balance information at specific timestamps, allowing you to track balance changes over time.

Key Features:
- Historical token balances for a specific wallet
- Multi-chain support
- Balance information at specific timestamps
- Track balance changes over time
- Detailed token metadata

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting historical balance data.
 */
export const GetHistoricalBalanceInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get historical balances for"),

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
        include_stablecoins: z.boolean().optional().default(false).describe("Whether to include stablecoins in the results"),
        include_native_tokens: z.boolean().optional().default(false).describe("Whether to include native tokens (e.g., ETH, SOL) in the results"),
        value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Value range filter in USD"),
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        token_sectors: z.array(z.string()).optional().describe("Token sectors filter"),
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
              "token_symbol",
              "value_usd",
              "balance",
              "token_sectors",
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
  .describe("Instructions for getting historical balance data");

/**
 * Response interface for historical balance data.
 */
interface HistoricalBalance {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  balance: number;
  value_usd?: number;
  timestamp: string;
}

interface HistoricalBalanceResponse {
  data: HistoricalBalance[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches historical balance data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the historical balance data.
 */
export async function getHistoricalBalance(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetHistoricalBalanceInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/historical-balance", {
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
      return `Error fetching historical balance: ${response.status} ${response.statusText}`;
    }

    const data: HistoricalBalanceResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No historical balance data found for wallet ${args.wallet_address}.`;
    }

    let result = `📈 Historical Balance for ${args.wallet_address}:\n\n`;

    data.data.forEach((balance, index) => {
      const timestamp = new Date(balance.timestamp).toLocaleString();
      result += `${index + 1}. ${balance.token_symbol} (${balance.chain})\n`;
      result += `   • Token Address: ${balance.token_address}\n`;
      result += `   • Balance: ${balance.balance.toFixed(6)}\n`;
      if (balance.value_usd) {
        result += `   • Value: $${balance.value_usd.toLocaleString()}\n`;
      }
      result += `   • Timestamp: ${timestamp}\n`;
      if (balance.token_sectors && balance.token_sectors.length > 0) {
        result += `   • Sectors: ${balance.token_sectors.join(", ")}\n`;
      }
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching historical balance: ${errorMessage}`;
  }
}

/**
 * Get Historical Balance action.
 */
export class GetHistoricalBalanceAction implements AgentkitAction<typeof GetHistoricalBalanceInput> {
  public name = "get_historical_balance";
  public description = GET_HISTORICAL_BALANCE_PROMPT;
  public argsSchema = GetHistoricalBalanceInput;
  public func = getHistoricalBalance;
  public smartAccountRequired = false;
}
