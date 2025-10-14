import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_CURRENT_BALANCE_PROMPT = `
Retrieve current token balances for a specific wallet address across multiple blockchains. This endpoint provides real-time balance information for all tokens held by the wallet.

Key Features:
- Current token balances for a specific wallet
- Multi-chain support
- Real-time balance information
- Detailed token metadata
- USD value calculations

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting current balance data.
 */
export const GetCurrentBalanceInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get balances for"),

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
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        })
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting current balance data");

/**
 * Response interface for current balance data.
 */
interface CurrentBalance {
  chain: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  balance: number;
  value_usd?: number;
}

interface CurrentBalanceResponse {
  data: CurrentBalance[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches current balance data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the current balance data.
 */
export async function getCurrentBalance(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetCurrentBalanceInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/current-balance", {
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
      return `Error fetching current balance: ${response.status} ${response.statusText}`;
    }

    const data: CurrentBalanceResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No balance data found for wallet ${args.wallet_address}.`;
    }

    let result = `💰 Current Balance for ${args.wallet_address}:\n\n`;

    data.data.forEach((balance, index) => {
      result += `${index + 1}. ${balance.token_symbol} (${balance.chain})\n`;
      result += `   • Token Address: ${balance.token_address}\n`;
      result += `   • Balance: ${balance.balance.toFixed(6)}\n`;
      if (balance.value_usd) {
        result += `   • Value: $${balance.value_usd.toLocaleString()}\n`;
      }
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
    return `Error fetching current balance: ${errorMessage}`;
  }
}

/**
 * Get Current Balance action.
 */
export class GetCurrentBalanceAction implements AgentkitAction<typeof GetCurrentBalanceInput> {
  public name = "get_current_balance";
  public description = GET_CURRENT_BALANCE_PROMPT;
  public argsSchema = GetCurrentBalanceInput;
  public func = getCurrentBalance;
  public smartAccountRequired = false;
}
