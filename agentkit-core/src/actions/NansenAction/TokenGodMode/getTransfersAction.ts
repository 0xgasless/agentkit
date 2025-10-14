import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TRANSFERS_PROMPT = `
Retrieve transfer activity for a specific token across multiple blockchains. This endpoint provides detailed information about token transfers including sender/receiver information, amounts, and transaction details.

Key Features:
- Transfer activity for a specific token
- Multi-chain support
- Sender and receiver information
- Transfer amounts and values
- Comprehensive transfer analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting transfers data.
 */
export const GetTransfersInput = z
  .object({
    token_address: z.string().describe("The token address to get transfers for"),

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
        from_address: z.string().optional().describe("From address filter"),
        to_address: z.string().optional().describe("To address filter"),
        from_label: z.string().optional().describe("From label filter"),
        to_label: z.string().optional().describe("To label filter"),
        from_type: z.array(z.string()).optional().describe("From type filter"),
        to_type: z.array(z.string()).optional().describe("To type filter"),
        amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Amount range filter"),
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
              "token_address",
              "transaction_hash",
              "from_address",
              "to_address",
              "from_label",
              "to_label",
              "from_type",
              "to_type",
              "amount",
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
  .describe("Instructions for getting transfers data");

/**
 * Response interface for transfers data.
 */
interface Transfer {
  chain: string;
  token_address: string;
  transaction_hash: string;
  from_address: string;
  to_address: string;
  from_label: string;
  to_label: string;
  from_type: string;
  to_type: string;
  amount: number;
  value_usd?: number;
  timestamp: string;
}

interface TransfersResponse {
  data: Transfer[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches transfers data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the transfers data.
 */
export async function getTransfers(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTransfersInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/transfers", {
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
      return `Error fetching transfers: ${response.status} ${response.statusText}`;
    }

    const data: TransfersResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No transfers found for token ${args.token_address}.`;
    }

    let result = `📤 Transfers for ${args.token_address}:\n\n`;

    data.data.forEach((transfer, index) => {
      const timestamp = new Date(transfer.timestamp).toLocaleString();
      const fromEmoji =
        transfer.from_type === "exchange"
          ? "🏦"
          : transfer.from_type === "defi"
            ? "🔄"
            : transfer.from_type === "smart_money"
              ? "🧠"
              : transfer.from_type === "whale"
                ? "🐋"
                : "👤";
      const toEmoji =
        transfer.to_type === "exchange"
          ? "🏦"
          : transfer.to_type === "defi"
            ? "🔄"
            : transfer.to_type === "smart_money"
              ? "🧠"
              : transfer.to_type === "whale"
                ? "🐋"
                : "👤";

      result += `${index + 1}. Transfer ${fromEmoji}→${toEmoji}\n`;
      result += `   • From: ${transfer.from_label || transfer.from_address}\n`;
      result += `   • To: ${transfer.to_label || transfer.to_address}\n`;
      result += `   • Chain: ${transfer.chain}\n`;
      result += `   • Amount: ${transfer.amount.toFixed(6)}\n`;
      if (transfer.value_usd) {
        result += `   • Value: $${transfer.value_usd.toLocaleString()}\n`;
      }
      result += `   • Time: ${timestamp}\n`;
      result += `   • Tx Hash: ${transfer.transaction_hash}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching transfers: ${errorMessage}`;
  }
}

/**
 * Get Transfers action.
 */
export class GetTransfersAction implements AgentkitAction<typeof GetTransfersInput> {
  public name = "get_transfers";
  public description = GET_TRANSFERS_PROMPT;
  public argsSchema = GetTransfersInput;
  public func = getTransfers;
  public smartAccountRequired = false;
}
