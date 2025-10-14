import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TRANSACTIONS_PROMPT = `
Retrieve transaction history for a specific wallet address across multiple blockchains. This endpoint provides detailed transaction information including transfers, swaps, and other blockchain activities.

Key Features:
- Transaction history for a specific wallet
- Multi-chain support
- Detailed transaction information
- Transfer and swap activities
- Comprehensive transaction metadata

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting transactions data.
 */
export const GetTransactionsInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get transactions for"),

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
        transaction_hash: z.string().optional().describe("Transaction hash filter"),
        transaction_type: z.array(z.string()).optional().describe("Transaction type filter"),
        token_address: z.string().optional().describe("Token address filter"),
        token_symbol: z.string().optional().describe("Token symbol filter"),
        counterparty_address: z.string().optional().describe("Counterparty address filter"),
        counterparty_label: z.string().optional().describe("Counterparty label filter"),
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
              "transaction_hash",
              "transaction_type",
              "token_address",
              "token_symbol",
              "counterparty_address",
              "counterparty_label",
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
  .describe("Instructions for getting transactions data");

/**
 * Response interface for transactions data.
 */
interface Transaction {
  chain: string;
  transaction_hash: string;
  transaction_type: string;
  token_address: string;
  token_symbol: string;
  counterparty_address: string;
  counterparty_label: string;
  value_usd?: number;
  timestamp: string;
}

interface TransactionsResponse {
  data: Transaction[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches transactions data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the transactions data.
 */
export async function getTransactions(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTransactionsInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/transactions", {
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
      return `Error fetching transactions: ${response.status} ${response.statusText}`;
    }

    const data: TransactionsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No transactions found for wallet ${args.wallet_address}.`;
    }

    let result = `📋 Transactions for ${args.wallet_address}:\n\n`;

    data.data.forEach((tx, index) => {
      const timestamp = new Date(tx.timestamp).toLocaleString();
      const typeEmoji = tx.transaction_type === "swap" ? "🔄" : tx.transaction_type === "transfer" ? "📤" : "📄";
      
      result += `${index + 1}. Transaction ${typeEmoji}\n`;
      result += `   • Type: ${tx.transaction_type}\n`;
      result += `   • Chain: ${tx.chain}\n`;
      result += `   • Token: ${tx.token_symbol} (${tx.token_address})\n`;
      result += `   • Counterparty: ${tx.counterparty_label || tx.counterparty_address}\n`;
      if (tx.value_usd) {
        result += `   • Value: $${tx.value_usd.toLocaleString()}\n`;
      }
      result += `   • Time: ${timestamp}\n`;
      result += `   • Tx Hash: ${tx.transaction_hash}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching transactions: ${errorMessage}`;
  }
}

/**
 * Get Transactions action.
 */
export class GetTransactionsAction implements AgentkitAction<typeof GetTransactionsInput> {
  public name = "get_transactions";
  public description = GET_TRANSACTIONS_PROMPT;
  public argsSchema = GetTransactionsInput;
  public func = getTransactions;
  public smartAccountRequired = false;
}
