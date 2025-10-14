import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PNL_PROMPT = `
Retrieve detailed profit and loss information for a specific wallet address across multiple blockchains. This endpoint provides transaction-level PnL data including individual trade performance and detailed metrics.

Key Features:
- Detailed PnL information for a specific wallet
- Multi-chain support (looped client-side)
- Transaction-level PnL data
- Individual trade performance
- Detailed trading metrics

This endpoint requires a Nansen API key to be configured.
`;

// Input schema (chains now ENUM but for API only one chain per request)
export const GetPnlInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get PnL data for"),
    chains: z
      .array(
        z.enum([
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
      .describe("Chains to include in the analysis. Each chain requested separately."),
    filters: z
      .object({
        transaction_hash: z.string().optional(),
        token_address: z.string().optional(),
        token_symbol: z.string().optional(),
        token_sectors: z.array(z.string()).optional(),
        pnl_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional(),
        pnl_percent: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional(),
        timestamp: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    pagination: z
      .object({
        page: z.number().min(1).default(1),
        per_page: z.number().min(1).max(1000).default(10),
      })
      .optional(),
    order_by: z
      .array(
        z.object({
          field: z.enum([
            "chain",
            "transaction_hash",
            "token_address",
            "token_symbol",
            "token_sectors",
            "pnl_usd",
            "pnl_percent",
            "timestamp",
          ]),
          direction: z.enum(["ASC", "DESC"]),
        }),
      )
      .optional(),
  })
  .strip()
  .describe("Instructions for getting PnL data");

// Response Interface
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

interface PnlRequestBody {
  address: string;
  chain: string;
  date?: { from?: string; to?: string };
  pagination?: { page: number; per_page: number };
  order_by?: { field: string; direction: string }[];
  transaction_hash?: string;
  token_address?: string;
  token_symbol?: string;
  token_sectors?: string[];
  pnl_usd?: { min?: number; max?: number };
  pnl_percent?: { min?: number; max?: number };
}

// Main function - loops over chains, fetches separately!
export async function getPnl(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPnlInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) return "Error: NANSEN_API_KEY environment variable is required but not set.";

    let allResults = "";

    for (const chain of args.chains) {
      const requestBody: PnlRequestBody = {
        address: args.wallet_address, // API expects 'address'
        chain: chain, // API expects 'chain' (string)
      };

      // Time filter mapping
      if (args.filters?.timestamp) {
        requestBody.date = {
          from: args.filters.timestamp.from,
          to: args.filters.timestamp.to,
        };
      }

      // Pagination
      if (args.pagination) {
        requestBody.pagination = args.pagination;
      }

      // If sorting, handle
      if (args.order_by) {
        requestBody.order_by = args.order_by;
      }

      // Other filters: flatten if present
      if (args.filters) {
        if (args.filters.transaction_hash)
          requestBody.transaction_hash = args.filters.transaction_hash;
        if (args.filters.token_address) requestBody.token_address = args.filters.token_address;
        if (args.filters.token_symbol) requestBody.token_symbol = args.filters.token_symbol;
        if (args.filters.token_sectors) requestBody.token_sectors = args.filters.token_sectors;
        if (args.filters.pnl_usd) requestBody.pnl_usd = args.filters.pnl_usd;
        if (args.filters.pnl_percent) requestBody.pnl_percent = args.filters.pnl_percent;
      }

      const response = await fetch("https://api.nansen.ai/api/v1/profiler/address/pnl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apiKey: apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 401)
          return "Error: Invalid Nansen API key. Please check your NANSEN_API_KEY environment variable.";
        if (response.status === 403)
          return "Error: Insufficient subscription tier for this endpoint.";
        if (response.status === 429)
          return "Error: Rate limit exceeded. Please wait before making another request.";
        allResults += `Error fetching PnL: ${response.status} ${response.statusText} for chain ${chain}\n`;
        continue;
      }

      const data: PnlResponse = await response.json();

      if (!data.data || data.data.length === 0) {
        allResults += `No PnL data found for wallet ${args.wallet_address} on ${chain}.\n`;
        continue;
      }

      allResults += `💰 PnL Details for ${args.wallet_address} on ${chain}:\n\n`;
      data.data.forEach((pnl, index) => {
        const timestamp = pnl.timestamp ? new Date(pnl.timestamp).toLocaleString() : "N/A";
        const pnlEmoji = pnl.pnl_usd !== undefined && pnl.pnl_usd >= 0 ? "📈" : "📉";
        allResults += `${index + 1}. PnL Transaction ${pnlEmoji}\n`;
        allResults += `   • Token: ${pnl.token_symbol} (${pnl.token_address})\n`;
        allResults += `   • PnL: $${pnl.pnl_usd !== undefined ? pnl.pnl_usd.toLocaleString() : "N/A"}\n`;
        allResults += `   • PnL %: ${pnl.pnl_percent !== undefined ? pnl.pnl_percent.toFixed(2) : "N/A"}%\n`;
        if (pnl.token_sectors && pnl.token_sectors.length > 0) {
          allResults += `   • Sectors: ${pnl.token_sectors.join(", ")}\n`;
        }
        allResults += `   • Time: ${timestamp}\n`;
        allResults += `   • Tx Hash: ${pnl.transaction_hash}\n\n`;
      });
      if (!data.pagination.is_last_page) {
        allResults += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
      }
    }

    return (
      allResults.trim() ||
      `No PnL data found for wallet ${args.wallet_address} on requested chains.`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching PnL: ${errorMessage}`;
  }
}

// AgentKit Action class
export class GetPnlAction implements AgentkitAction<typeof GetPnlInput> {
  public name = "get_pnl";
  public description = GET_PNL_PROMPT;
  public argsSchema = GetPnlInput;
  public func = getPnl;
  public smartAccountRequired = false;
}
