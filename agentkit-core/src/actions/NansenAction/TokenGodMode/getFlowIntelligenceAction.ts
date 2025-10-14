import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_FLOW_INTELLIGENCE_PROMPT = `
Retrieve flow intelligence data for a specific token across multiple blockchains. This endpoint provides insights into token flows, including inflows, outflows, and net flows from different entity types.

Key Features:
- Flow intelligence data for a specific token
- Multi-chain support
- Inflows, outflows, and net flows
- Entity type analysis
- Comprehensive flow metrics

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting flow intelligence data.
 */
export const GetFlowIntelligenceInput = z
  .object({
    token_address: z.string().describe("The token address to get flow intelligence for"),

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
        entity_type: z.array(z.string()).optional().describe("Entity type filter"),
        flow_type: z
          .array(z.string())
          .optional()
          .describe("Flow type filter (inflow, outflow, net)"),
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
            .enum(["chain", "token_address", "entity_type", "flow_type", "value_usd", "timestamp"])
            .describe("Field to sort by"),
          direction: z.enum(["ASC", "DESC"]).describe("Sort direction"),
        }),
      )
      .optional()
      .describe("Custom sort order to override the endpoint's default ordering"),
  })
  .strip()
  .describe("Instructions for getting flow intelligence data");

/**
 * Response interface for flow intelligence data.
 */
interface FlowIntelligence {
  chain: string;
  token_address: string;
  entity_type: string;
  flow_type: string;
  value_usd?: number;
  timestamp: string;
}

interface FlowIntelligenceResponse {
  data: FlowIntelligence[];
  pagination: {
    page: number;
    per_page: number;
    is_last_page: boolean;
  };
}

/**
 * Fetches flow intelligence data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing token address, chains, filters, pagination, and sorting options.
 * @returns A formatted string containing the flow intelligence data.
 */
export async function getFlowIntelligence(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetFlowIntelligenceInput>,
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

    const response = await fetch("https://api.nansen.ai/api/v1/token-god-mode/flow-intelligence", {
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
      return `Error fetching flow intelligence: ${response.status} ${response.statusText}`;
    }

    const data: FlowIntelligenceResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return `No flow intelligence data found for token ${args.token_address}.`;
    }

    let result = `🌊 Flow Intelligence for ${args.token_address}:\n\n`;

    data.data.forEach((flow, index) => {
      const timestamp = new Date(flow.timestamp).toLocaleString();
      const flowEmoji =
        flow.flow_type === "inflow" ? "📈" : flow.flow_type === "outflow" ? "📉" : "⚖️";
      const entityEmoji =
        flow.entity_type === "exchange"
          ? "🏦"
          : flow.entity_type === "defi"
            ? "🔄"
            : flow.entity_type === "smart_money"
              ? "🧠"
              : "👤";

      result += `${index + 1}. Flow Data ${flowEmoji}\n`;
      result += `   • Entity: ${entityEmoji} ${flow.entity_type}\n`;
      result += `   • Flow Type: ${flow.flow_type}\n`;
      result += `   • Chain: ${flow.chain}\n`;
      if (flow.value_usd) {
        result += `   • Value: $${flow.value_usd.toLocaleString()}\n`;
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
    return `Error fetching flow intelligence: ${errorMessage}`;
  }
}

/**
 * Get Flow Intelligence action.
 */
export class GetFlowIntelligenceAction implements AgentkitAction<typeof GetFlowIntelligenceInput> {
  public name = "get_flow_intelligence";
  public description = GET_FLOW_INTELLIGENCE_PROMPT;
  public argsSchema = GetFlowIntelligenceInput;
  public func = getFlowIntelligence;
  public smartAccountRequired = false;
}
