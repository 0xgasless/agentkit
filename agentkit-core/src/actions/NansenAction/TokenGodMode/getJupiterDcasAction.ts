import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_JUPITER_DCAS_PROMPT = `
Retrieve Jupiter DCA (Dollar Cost Averaging) orders for a specific token on Solana. This endpoint provides detailed information about DCA strategies including order details, amounts, and execution status.

Key Features:
- Jupiter DCA orders for a specific token on Solana
- DCA strategy information
- Order details and execution status
- Amount and timing information
- Comprehensive DCA analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting Jupiter DCAs data.
 */
export const GetJupiterDcasInput = z
  .object({
    token_address: z.string().describe("The token address to get Jupiter DCA orders for"),

    filters: z
      .object({
        dca_vault_address: z.string().optional().describe("DCA vault address filter"),
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_label: z.string().optional().describe("Trader label filter"),
        trader_type: z.array(z.string()).optional().describe("Trader type filter"),
        dca_status: z.array(z.string()).optional().describe("DCA status filter"),
        input_token_symbol: z.string().optional().describe("Input token symbol filter"),
        output_token_symbol: z.string().optional().describe("Output token symbol filter"),
        deposit_token_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Deposit token amount range filter"),
        token_spent_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Token spent amount range filter"),
        output_token_redeemed_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Output token redeemed amount range filter"),
        deposit_value_usd: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Deposit value range filter in USD"),
        dca_created_at: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional()
          .describe("DCA creation date range filter"),
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
              "token_address",
              "dca_vault_address",
              "trader_address",
              "trader_label",
              "trader_type",
              "dca_status",
              "input_token_symbol",
              "output_token_symbol",
              "deposit_token_amount",
              "token_spent_amount",
              "output_token_redeemed_amount",
              "deposit_value_usd",
              "dca_created_at",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        })
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting Jupiter DCAs data");

/**
 * Response interface for Jupiter DCAs data.
 */
interface JupiterDca {
  token_address: string;
  dca_vault_address: string;
  trader_address: string;
  trader_label: string;
  trader_type: string;
  dca_status: string;
  input_token_symbol: string;
  output_token_symbol: string;
  deposit_token_amount?: number;
  token_spent_amount?: number;
  output_token_redeemed_amount?: number;
  deposit_value_usd?: number;
  dca_created_at: string;
}

interface JupiterDcasResponse {
  data: JupiterDca[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches Jupiter DCAs data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, filters, pagination, and sorting options.
 * @returns A formatted string containing the Jupiter DCAs data.
 */
export async function getJupiterDcas(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetJupiterDcasInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      token_address: args.token_address,
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/jupiter-dcas", {
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
      return `Error fetching Jupiter DCAs: ${response.status} ${response.statusText}`;
    }

    const data: JupiterDcasResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No Jupiter DCA orders found for token ${args.token_address}.`;
    }

    let result = `📈 Jupiter DCA Orders for ${args.token_address}:\n\n`;

    data.data.forEach((dca, index) => {
      const createdDate = new Date(dca.dca_created_at).toLocaleString();
      const statusEmoji = dca.dca_status === "active" ? "🟢" : "🔴";
      const typeEmoji = dca.trader_type === "exchange" ? "🏦" : 
                       dca.trader_type === "defi" ? "🔄" : 
                       dca.trader_type === "smart_money" ? "🧠" : 
                       dca.trader_type === "whale" ? "🐋" : "👤";
      
      result += `${index + 1}. DCA Order ${statusEmoji}\n`;
      result += `   • Trader: ${typeEmoji} ${dca.trader_label || dca.trader_address}\n`;
      result += `   • Type: ${dca.trader_type}\n`;
      result += `   • Status: ${dca.dca_status}\n`;
      result += `   • Strategy: ${dca.input_token_symbol} → ${dca.output_token_symbol}\n`;
      if (dca.deposit_token_amount) {
        result += `   • Deposit Amount: ${dca.deposit_token_amount.toFixed(4)} ${dca.input_token_symbol}\n`;
      }
      if (dca.token_spent_amount) {
        result += `   • Tokens Spent: ${dca.token_spent_amount.toFixed(4)} ${dca.input_token_symbol}\n`;
      }
      if (dca.output_token_redeemed_amount) {
        result += `   • Tokens Redeemed: ${dca.output_token_redeemed_amount.toFixed(4)} ${dca.output_token_symbol}\n`;
      }
      if (dca.deposit_value_usd) {
        result += `   • Deposit Value: $${dca.deposit_value_usd.toLocaleString()}\n`;
      }
      result += `   • Created: ${createdDate}\n`;
      result += `   • DCA Vault: ${dca.dca_vault_address}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching Jupiter DCAs: ${errorMessage}`;
  }
}

/**
 * Get Jupiter DCAs action.
 */
export class GetJupiterDcasAction implements AgentkitAction<typeof GetJupiterDcasInput> {
  public name = "get_jupiter_dcas";
  public description = GET_JUPITER_DCAS_PROMPT;
  public argsSchema = GetJupiterDcasInput;
  public func = getJupiterDcas;
  public smartAccountRequired = false;
}
