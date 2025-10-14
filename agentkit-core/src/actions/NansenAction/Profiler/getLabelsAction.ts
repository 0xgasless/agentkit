import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_LABELS_PROMPT = `
Retrieve labels for a specific wallet address across multiple blockchains. This endpoint provides entity labels, classifications, and metadata associated with the wallet address.

Key Features:
- Labels for a specific wallet address
- Multi-chain support
- Entity labels and classifications
- Wallet metadata and information
- Comprehensive address analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting labels data.
 */
export const GetLabelsInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get labels for"),

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
        label_type: z.array(z.string()).optional().describe("Label type filter"),
        label_category: z.array(z.string()).optional().describe("Label category filter"),
        label_name: z.string().optional().describe("Label name filter"),
        confidence_score: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Confidence score range filter (0-1)"),
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
              "label_type",
              "label_category",
              "label_name",
              "confidence_score",
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
  .describe("Instructions for getting labels data");

/**
 * Response interface for labels data.
 */
interface Label {
  chain: string;
  label_type: string;
  label_category: string;
  label_name: string;
  confidence_score: number;
  timestamp: string;
}

interface LabelsResponse {
  data: Label[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches labels data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the labels data.
 */
export async function getLabels(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetLabelsInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/labels", {
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
      return `Error fetching labels: ${response.status} ${response.statusText}`;
    }

    const data: LabelsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No labels found for wallet ${args.wallet_address}.`;
    }

    let result = `🏷️ Labels for ${args.wallet_address}:\n\n`;

    data.data.forEach((label, index) => {
      const timestamp = new Date(label.timestamp).toLocaleString();
      const confidenceEmoji = label.confidence_score >= 0.8 ? "🎯" : 
                            label.confidence_score >= 0.6 ? "⚖️" : "🎲";
      
      result += `${index + 1}. Label ${confidenceEmoji}\n`;
      result += `   • Name: ${label.label_name}\n`;
      result += `   • Type: ${label.label_type}\n`;
      result += `   • Category: ${label.label_category}\n`;
      result += `   • Chain: ${label.chain}\n`;
      result += `   • Confidence: ${confidenceEmoji} ${(label.confidence_score * 100).toFixed(1)}%\n`;
      result += `   • Added: ${timestamp}\n`;
      result += "\n";
    });

    if (!data.pagination.is_last_page) {
      result += `Page ${data.pagination.page} of results. Use pagination to get more results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching labels: ${errorMessage}`;
  }
}

/**
 * Get Labels action.
 */
export class GetLabelsAction implements AgentkitAction<typeof GetLabelsInput> {
  public name = "get_labels";
  public description = GET_LABELS_PROMPT;
  public argsSchema = GetLabelsInput;
  public func = getLabels;
  public smartAccountRequired = false;
}
