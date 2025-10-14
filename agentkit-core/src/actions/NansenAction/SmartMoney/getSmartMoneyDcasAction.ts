import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_SMART_MONEY_DCAS_PROMPT = `
Monitor DCA strategies employed by smart money on Solana through Jupiter DCA. This endpoint reveals systematic accumulation strategies used by smart money.

Key Features:
- DCA strategies employed by smart money on Solana
- Jupiter DCA integration
- Systematic accumulation strategies
- Real-time monitoring of DCA orders
- Detailed DCA vault information

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting smart money DCAs data.
 */
export const GetSmartMoneyDcasInput = z
  .object({
    filters: z
      .object({
        include_smart_money_labels: z
          .array(
            z.enum([
              "Fund",
              "Smart Trader",
              "30D Smart Trader",
              "90D Smart Trader",
              "180D Smart Trader",
            ]),
          )
          .optional()
          .describe("Smart money category filters to include"),
        exclude_smart_money_labels: z
          .array(
            z.enum([
              "Fund",
              "Smart Trader",
              "30D Smart Trader",
              "90D Smart Trader",
              "180D Smart Trader",
            ]),
          )
          .optional()
          .describe("Smart money category filters to exclude"),
        dca_created_at: z
          .object({
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional()
          .describe("Date range filter for DCA creation timestamps"),
        transaction_hash: z.string().optional().describe("Transaction hash filter"),
        trader_address: z.string().optional().describe("Trader address filter"),
        trader_address_label: z.string().optional().describe("Trader name or label filter"),
        input_token_symbol: z.string().optional().describe("Symbol filter for input tokens"),
        output_token_symbol: z.string().optional().describe("Symbol filter for output tokens"),
        deposit_token_amount: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Deposit amount range filter"),
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
              "dca_created_at",
              "dca_updated_at",
              "input_token_symbol",
              "output_token_symbol",
              "deposit_token_amount",
              "token_spent_amount",
              "deposit_value_usd",
              "output_token_redeemed_amount",
            ])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        }),
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting smart money DCAs data");

/**
 * Response interface for smart money DCAs data.
 */
interface SmartMoneyDca {
  dca_created_at: string;
  dca_updated_at: string;
  trader_address: string;
  transaction_hash: string;
  trader_address_label: string;
  dca_vault_address: string;
  input_token_address: string;
  output_token_address: string;
  deposit_token_amount?: number;
  token_spent_amount?: number;
  output_token_redeemed_amount?: number;
  dca_status: string;
  input_token_symbol: string;
  output_token_symbol: string;
  deposit_value_usd?: number;
}

interface SmartMoneyDcasResponse {
  data: SmartMoneyDca[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches smart money DCAs data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing filters, pagination, and sorting options.
 * @returns A formatted string containing the smart money DCAs data.
 */
export async function getSmartMoneyDcas(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetSmartMoneyDcasInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const requestBody = {
      ...(args.filters && { filters: args.filters }),
      ...(args.pagination && { pagination: args.pagination }),
      ...(args.order_by && { order_by: args.order_by }),
    };

    const response = await fetch("https://api.nansen.ai/api/v1/smart-money/dcas", {
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
      return `Error fetching smart money DCAs: ${response.status} ${response.statusText}`;
    }

    const data: SmartMoneyDcasResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return "No smart money DCA orders found matching your criteria.";
    }

    let result = "📈 Smart Money DCA Orders (Jupiter):\n\n";

    data.data.forEach((dca, index) => {
      const createdDate = new Date(dca.dca_created_at).toLocaleString();
      const updatedDate = new Date(dca.dca_updated_at).toLocaleString();
      const statusEmoji = dca.dca_status === "active" ? "🟢" : "🔴";

      result += `${index + 1}. DCA Order ${statusEmoji}\n`;
      result += `   • Trader: ${dca.trader_address_label || dca.trader_address}\n`;
      result += `   • Strategy: ${dca.input_token_symbol} → ${dca.output_token_symbol}\n`;
      result += `   • Status: ${dca.dca_status}\n`;
      result += `   • Created: ${createdDate}\n`;
      result += `   • Updated: ${updatedDate}\n`;
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
      result += `   • DCA Vault: ${dca.dca_vault_address}\n`;
      result += `   • Tx Hash: ${dca.transaction_hash}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching smart money DCAs: ${errorMessage}`;
  }
}

/**
 * Get Smart Money DCAs action.
 */
export class GetSmartMoneyDcasAction implements AgentkitAction<typeof GetSmartMoneyDcasInput> {
  public name = "get_smart_money_dcas";
  public description = GET_SMART_MONEY_DCAS_PROMPT;
  public argsSchema = GetSmartMoneyDcasInput;
  public func = getSmartMoneyDcas;
  public smartAccountRequired = false;
}
