import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_COUNTERPARTIES_PROMPT = `
Retrieve counterparty information for a specific wallet address across multiple blockchains. This endpoint provides detailed information about entities that have interacted with the wallet, including transaction counts, volumes, and labels.

Key Features:
- Counterparty information for a specific wallet
- Multi-chain support
- Transaction counts and volumes
- Entity labels and classifications
- Comprehensive interaction history

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting counterparties data.
 */
export const GetCounterpartiesInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get counterparties for"),

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
        counterparty_address: z.string().optional().describe("Counterparty address filter"),
        counterparty_label: z.string().optional().describe("Counterparty label filter"),
        counterparty_type: z.array(z.string()).optional().describe("Counterparty type filter"),
        transaction_count: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Transaction count range filter"),
        volume_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Volume range filter in USD"),
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
              "counterparty_address",
              "counterparty_label",
              "counterparty_type",
              "transaction_count",
              "volume_usd",
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
  .describe("Instructions for getting counterparties data");

/**
 * Response interface for counterparties data.
 */
interface Counterparty {
  chain: string;
  counterparty_address: string;
  counterparty_label: string;
  counterparty_type: string;
  transaction_count: number;
  volume_usd?: number;
  timestamp: string;
}

interface CounterpartiesResponse {
  data: Counterparty[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches counterparties data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the counterparties data.
 */
export async function getCounterparties(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetCounterpartiesInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/counterparties", {
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
      return `Error fetching counterparties: ${response.status} ${response.statusText}`;
    }

    const data: CounterpartiesResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No counterparties found for wallet ${args.wallet_address}.`;
    }

    let result = `🤝 Counterparties for ${args.wallet_address}:\n\n`;

    data.data.forEach((counterparty, index) => {
      const timestamp = new Date(counterparty.timestamp).toLocaleString();
      const typeEmoji =
        counterparty.counterparty_type === "exchange"
          ? "🏦"
          : counterparty.counterparty_type === "defi"
            ? "🔄"
            : counterparty.counterparty_type === "nft"
              ? "🎨"
              : "👤";

      result += `${index + 1}. Counterparty ${typeEmoji}\n`;
      result += `   • Address: ${counterparty.counterparty_address}\n`;
      result += `   • Label: ${counterparty.counterparty_label}\n`;
      result += `   • Type: ${counterparty.counterparty_type}\n`;
      result += `   • Chain: ${counterparty.chain}\n`;
      result += `   • Transactions: ${counterparty.transaction_count}\n`;
      if (counterparty.volume_usd) {
        result += `   • Volume: $${counterparty.volume_usd.toLocaleString()}\n`;
      }
      result += `   • Last Activity: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching counterparties: ${errorMessage}`;
  }
}

/**
 * Get Counterparties action.
 */
export class GetCounterpartiesAction implements AgentkitAction<typeof GetCounterpartiesInput> {
  public name = "get_counterparties";
  public description = GET_COUNTERPARTIES_PROMPT;
  public argsSchema = GetCounterpartiesInput;
  public func = getCounterparties;
  public smartAccountRequired = false;
}
