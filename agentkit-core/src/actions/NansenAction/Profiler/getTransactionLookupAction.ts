import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TRANSACTION_LOOKUP_PROMPT = `
Retrieve detailed transaction information for a specific transaction hash across multiple blockchains. This endpoint provides comprehensive transaction details including transfers, swaps, and other blockchain activities.

Key Features:
- Detailed transaction information for a specific transaction hash
- Multi-chain support
- Comprehensive transaction details
- Transfer and swap information
- Complete transaction metadata

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting transaction lookup data.
 */
export const GetTransactionLookupInput = z
  .object({
    transaction_hash: z.string().describe("The transaction hash to look up"),

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
        transaction_type: z.array(z.string()).optional().describe("Transaction type filter"),
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        token_sectors: z.array(z.string()).optional().describe("Token sectors filter"),
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
              "transaction_type",
              "token_address",
              "token_symbol",
              "token_sectors",
              "value_usd",
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
  .describe("Instructions for getting transaction lookup data");

/**
 * Response interface for transaction lookup data.
 */
interface TransactionLookup {
  chain: string;
  transaction_type: string;
  token_address: string;
  token_symbol: string;
  token_sectors: string[];
  value_usd?: number;
  timestamp: string;
}

interface TransactionLookupResponse {
  data: TransactionLookup[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches transaction lookup data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing transaction hash, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the transaction lookup data.
 */
export async function getTransactionLookup(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTransactionLookupInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      transaction_hash: args.transaction_hash,
      chains: args.chains,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/transaction-lookup", {
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
      return `Error fetching transaction lookup: ${response.status} ${response.statusText}`;
    }

    const data: TransactionLookupResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No transaction details found for hash ${args.transaction_hash}.`;
    }

    let result = `🔍 Transaction Lookup for ${args.transaction_hash}:\n\n`;

    data.data.forEach((tx, index) => {
      const timestamp = new Date(tx.timestamp).toLocaleString();
      const typeEmoji = tx.transaction_type === "swap" ? "🔄" : 
                       tx.transaction_type === "transfer" ? "📤" : 
                       tx.transaction_type === "mint" ? "🪙" : "📄";
      
      result += `${index + 1}. Transaction Detail ${typeEmoji}\n`;
      result += `   • Type: ${tx.transaction_type}\n`;
      result += `   • Chain: ${tx.chain}\n`;
      result += `   • Token: ${tx.token_symbol} (${tx.token_address})\n`;
      if (tx.value_usd) {
        result += `   • Value: $${tx.value_usd.toLocaleString()}\n`;
      }
      if (tx.token_sectors && tx.token_sectors.length > 0) {
        result += `   • Sectors: ${tx.token_sectors.join(", ")}\n`;
      }
      result += `   • Time: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching transaction lookup: ${errorMessage}`;
  }
}

/**
 * Get Transaction Lookup action.
 */
export class GetTransactionLookupAction implements AgentkitAction<typeof GetTransactionLookupInput> {
  public name = "get_transaction_lookup";
  public description = GET_TRANSACTION_LOOKUP_PROMPT;
  public argsSchema = GetTransactionLookupInput;
  public func = getTransactionLookup;
  public smartAccountRequired = false;
}
