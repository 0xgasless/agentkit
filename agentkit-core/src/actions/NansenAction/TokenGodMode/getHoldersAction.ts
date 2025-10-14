import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_HOLDERS_PROMPT = `
Retrieve holder information for a specific token across multiple blockchains. This endpoint provides detailed information about token holders including their balances, labels, and activity.

Key Features:
- Holder information for a specific token
- Multi-chain support
- Holder balances and labels
- Activity and transaction data
- Comprehensive holder analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting holders data.
 */
export const GetHoldersInput = z
  .object({
    token_address: z.string().describe("The token address to get holders for"),

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
        holder_address: z.string().optional().describe("Holder address filter"),
        holder_label: z.string().optional().describe("Holder label filter"),
        holder_type: z.array(z.string()).optional().describe("Holder type filter"),
        balance: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Balance range filter"),
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
              "token_address",
              "holder_address",
              "holder_label",
              "holder_type",
              "balance",
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
  .describe("Instructions for getting holders data");

/**
 * Response interface for holders data.
 */
interface Holder {
  chain: string;
  token_address: string;
  holder_address: string;
  holder_label: string;
  holder_type: string;
  balance: number;
  value_usd?: number;
  timestamp: string;
}

interface HoldersResponse {
  data: Holder[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches holders data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the holders data.
 */
export async function getHolders(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetHoldersInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/holders", {
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
      return `Error fetching holders: ${response.status} ${response.statusText}`;
    }

    const data: HoldersResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No holders found for token ${args.token_address}.`;
    }

    let result = `👥 Holders for ${args.token_address}:\n\n`;

    data.data.forEach((holder, index) => {
      const timestamp = new Date(holder.timestamp).toLocaleString();
      const typeEmoji = holder.holder_type === "exchange" ? "🏦" : 
                       holder.holder_type === "defi" ? "🔄" : 
                       holder.holder_type === "smart_money" ? "🧠" : 
                       holder.holder_type === "whale" ? "🐋" : "👤";
      
      result += `${index + 1}. Holder ${typeEmoji}\n`;
      result += `   • Address: ${holder.holder_address}\n`;
      result += `   • Label: ${holder.holder_label}\n`;
      result += `   • Type: ${holder.holder_type}\n`;
      result += `   • Chain: ${holder.chain}\n`;
      result += `   • Balance: ${holder.balance.toFixed(6)}\n`;
      if (holder.value_usd) {
        result += `   • Value: $${holder.value_usd.toLocaleString()}\n`;
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
    return `Error fetching holders: ${errorMessage}`;
  }
}

/**
 * Get Holders action.
 */
export class GetHoldersAction implements AgentkitAction<typeof GetHoldersInput> {
  public name = "get_holders";
  public description = GET_HOLDERS_PROMPT;
  public argsSchema = GetHoldersInput;
  public func = getHolders;
  public smartAccountRequired = false;
}
