import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_DEFI_HOLDINGS_PROMPT = `
Retrieve DeFi holdings for a specific wallet address across multiple blockchains. This endpoint provides detailed information about DeFi positions including protocols, tokens, and values.

Key Features:
- DeFi holdings for a specific wallet address
- Multi-chain support
- Protocol and token information
- Position values and metrics
- Comprehensive DeFi portfolio analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting DeFi holdings data.
 */
export const GetDefiHoldingsInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get DeFi holdings for"),

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
        protocol_name: z.string().optional().describe("Protocol name filter"),
        protocol_type: z.array(z.string()).optional().describe("Protocol type filter"),
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        position_type: z.array(z.string()).optional().describe("Position type filter"),
        value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Value range filter in USD"),
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
              "wallet_address",
              "protocol_name",
              "protocol_type",
              "token_address",
              "token_symbol",
              "position_type",
              "value_usd",
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
  .describe("Instructions for getting DeFi holdings data");

/**
 * Response interface for DeFi holdings data.
 */
interface DefiHolding {
  chain: string;
  wallet_address: string;
  protocol_name: string;
  protocol_type: string;
  token_address: string;
  token_symbol: string;
  position_type: string;
  value_usd?: number;
  timestamp: string;
}

interface DefiHoldingsResponse {
  data: DefiHolding[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches DeFi holdings data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the DeFi holdings data.
 */
export async function getDefiHoldings(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetDefiHoldingsInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/portfolio/defi-holdings", {
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
      return `Error fetching DeFi holdings: ${response.status} ${response.statusText}`;
    }

    const data: DefiHoldingsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No DeFi holdings found for wallet ${args.wallet_address}.`;
    }

    let result = `🏦 DeFi Holdings for ${args.wallet_address}:\n\n`;

    data.data.forEach((holding, index) => {
      const timestamp = new Date(holding.timestamp).toLocaleString();
      const protocolEmoji =
        holding.protocol_type === "lending"
          ? "💰"
          : holding.protocol_type === "dex"
            ? "🔄"
            : holding.protocol_type === "yield"
              ? "📈"
              : holding.protocol_type === "staking"
                ? "🔒"
                : "🏛️";
      const positionEmoji =
        holding.position_type === "supply"
          ? "📤"
          : holding.position_type === "borrow"
            ? "📥"
            : holding.position_type === "liquidity"
              ? "💧"
              : "📊";

      result += `${index + 1}. DeFi Position ${protocolEmoji}${positionEmoji}\n`;
      result += `   • Protocol: ${holding.protocol_name}\n`;
      result += `   • Type: ${holding.protocol_type}\n`;
      result += `   • Position: ${holding.position_type}\n`;
      result += `   • Token: ${holding.token_symbol} (${holding.token_address})\n`;
      result += `   • Chain: ${holding.chain}\n`;
      if (holding.value_usd) {
        result += `   • Value: $${holding.value_usd.toLocaleString()}\n`;
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
    return `Error fetching DeFi holdings: ${errorMessage}`;
  }
}

/**
 * Get DeFi Holdings action.
 */
export class GetDefiHoldingsAction implements AgentkitAction<typeof GetDefiHoldingsInput> {
  public name = "get_defi_holdings";
  public description = GET_DEFI_HOLDINGS_PROMPT;
  public argsSchema = GetDefiHoldingsInput;
  public func = getDefiHoldings;
  public smartAccountRequired = false;
}
