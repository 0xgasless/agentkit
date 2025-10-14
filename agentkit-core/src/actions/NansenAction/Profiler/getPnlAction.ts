import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PNL_PROMPT = `
Retrieve detailed profit and loss information for a specific wallet address across multiple blockchains. This endpoint provides transaction-level PnL data including individual trade performance and detailed metrics.

Key Features:
- Detailed PnL information for a specific wallet
- Multi-chain support
- Transaction-level PnL data
- Individual trade performance
- Detailed trading metrics

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting PnL data.
 */
export const GetPnlInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get PnL data for"),

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
        pnl_percent: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("PnL percentage range filter"),
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
              "transaction_hash",
              "token_address",
              "token_symbol",
              "token_sectors",
              "pnl_usd",
              "pnl_percent",
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
  .describe("Instructions for getting PnL data");

/**
 * Response interface for PnL data.
 */
interface Pnl {
  chain: string;
  transaction_hash: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  pnl_usd?: number;
  pnl_percent?: number;
  timestamp: string;
}

interface PnlResponse {
  data: Pnl[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches PnL data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the PnL data.
 */
export async function getPnl(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPnlInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/pnl", {
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
      return `Error fetching PnL: ${response.status} ${response.statusText}`;
    }

    const data: PnlResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No PnL data found for wallet ${args.wallet_address}.`;
    }

    let result = `💰 PnL Details for ${args.wallet_address}:\n\n`;

    data.data.forEach((pnl, index) => {
      const timestamp = new Date(pnl.timestamp).toLocaleString();
      const pnlEmoji = pnl.pnl_usd && pnl.pnl_usd >= 0 ? "📈" : "📉";

      result += `${index + 1}. PnL Transaction ${pnlEmoji}\n`;
      result += `   • Token: ${pnl.token_symbol} (${pnl.token_address})\n`;
      result += `   • Chain: ${pnl.chain}\n`;
      if (pnl.pnl_usd !== undefined) {
        result += `   • PnL: $${pnl.pnl_usd.toLocaleString()}\n`;
      }
      if (pnl.pnl_percent !== undefined) {
        result += `   • PnL %: ${pnl.pnl_percent.toFixed(2)}%\n`;
      }
      if (pnl.token_sectors && pnl.token_sectors.length > 0) {
        result += `   • Sectors: ${pnl.token_sectors.join(", ")}\n`;
      }
      result += `   • Time: ${timestamp}\n`;
      result += `   • Tx Hash: ${pnl.transaction_hash}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching PnL: ${errorMessage}`;
  }
}

/**
 * Get PnL action.
 */
export class GetPnlAction implements AgentkitAction<typeof GetPnlInput> {
  public name = "get_pnl";
  public description = GET_PNL_PROMPT;
  public argsSchema = GetPnlInput;
  public func = getPnl;
  public smartAccountRequired = false;
}
