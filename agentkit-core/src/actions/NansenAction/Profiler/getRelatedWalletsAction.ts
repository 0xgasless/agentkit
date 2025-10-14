import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_RELATED_WALLETS_PROMPT = `
Retrieve related wallet addresses for a specific wallet address across multiple blockchains. This endpoint identifies wallets that are likely controlled by the same entity through various clustering techniques.

Key Features:
- Related wallet addresses for a specific wallet
- Multi-chain support
- Wallet clustering and identification
- Relationship strength indicators
- Comprehensive wallet network analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting related wallets data.
 */
export const GetRelatedWalletsInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get related wallets for"),

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
        related_wallet_address: z.string().optional().describe("Related wallet address filter"),
        relationship_type: z.array(z.string()).optional().describe("Relationship type filter"),
        relationship_strength: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe("Relationship strength range filter"),
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
              "related_wallet_address",
              "relationship_type",
              "relationship_strength",
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
  .describe("Instructions for getting related wallets data");

/**
 * Response interface for related wallets data.
 */
interface RelatedWallet {
  chain: string;
  related_wallet_address: string;
  relationship_type: string;
  relationship_strength: number;
  transaction_count: number;
  volume_usd?: number;
  timestamp: string;
}

interface RelatedWalletsResponse {
  data: RelatedWallet[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches related wallets data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the related wallets data.
 */
export async function getRelatedWallets(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetRelatedWalletsInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/profiler/related-wallets", {
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
      return `Error fetching related wallets: ${response.status} ${response.statusText}`;
    }

    const data: RelatedWalletsResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No related wallets found for wallet ${args.wallet_address}.`;
    }

    let result = `🔗 Related Wallets for ${args.wallet_address}:\n\n`;

    data.data.forEach((wallet, index) => {
      const timestamp = new Date(wallet.timestamp).toLocaleString();
      const strengthEmoji =
        wallet.relationship_strength >= 0.8
          ? "🔗"
          : wallet.relationship_strength >= 0.6
            ? "🔗"
            : "🔗";

      result += `${index + 1}. Related Wallet ${strengthEmoji}\n`;
      result += `   • Address: ${wallet.related_wallet_address}\n`;
      result += `   • Relationship: ${wallet.relationship_type}\n`;
      result += `   • Strength: ${(wallet.relationship_strength * 100).toFixed(1)}%\n`;
      result += `   • Chain: ${wallet.chain}\n`;
      result += `   • Transactions: ${wallet.transaction_count}\n`;
      if (wallet.volume_usd) {
        result += `   • Volume: $${wallet.volume_usd.toLocaleString()}\n`;
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
    return `Error fetching related wallets: ${errorMessage}`;
  }
}

/**
 * Get Related Wallets action.
 */
export class GetRelatedWalletsAction implements AgentkitAction<typeof GetRelatedWalletsInput> {
  public name = "get_related_wallets";
  public description = GET_RELATED_WALLETS_PROMPT;
  public argsSchema = GetRelatedWalletsInput;
  public func = getRelatedWallets;
  public smartAccountRequired = false;
}
