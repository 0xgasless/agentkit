import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_DEFI_HOLDINGS_PROMPT = `
Retrieve DeFi holdings for a specific wallet address across multiple blockchains. This endpoint provides detailed information about DeFi positions including protocols, tokens, and values.

Key Features:
- DeFi holdings for a specific wallet address
- Multi-chain support
- Protocol and token information
- Position values and metrics
- Comprehensive DeFi portfolio analysis

This endpoint requires a Nansen API key to be configured.
`;

/**
 * Input schema for getting DeFi holdings data.
 */
export const GetDefiHoldingsInput = z
  .object({
    wallet_address: z.string().describe("The wallet address to get DeFi holdings for"),
  })
  .describe("Input schema for getting DeFi holdings data.");

interface TokenHolding {
  token_symbol: string;
  amount: number;
  value_usd: number;
}

interface ProtocolHolding {
  protocol_name: string;
  chain: string;
  total_value_usd: number;
  tokens: TokenHolding[];
}

/**
 * Fetches DeFi holdings data from Nansen API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing wallet address.
 * @returns A formatted string containing the DeFi holdings data.
 */
export async function getDefiHoldings(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetDefiHoldingsInput>,
): Promise<string> {
  try {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      return "Error: NANSEN_API_KEY environment variable is required but not set.";
    }

    const response = await fetch("https://api.nansen.ai/api/v1/portfolio/defi-holdings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: apiKey,
      },
      body: JSON.stringify({ wallet_address: args.wallet_address }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return `Error fetching DeFi holdings: ${response.statusText} - ${JSON.stringify(errorData)}`;
    }

    const data = await response.json();

    if (!data.protocols || data.protocols.length === 0) {
      return `No DeFi holdings found for wallet ${args.wallet_address}.`;
    }

    let result = `🏦 DeFi Holdings for ${args.wallet_address}:\n\n`;
    result += `**Summary:**\n`;
    result += `  - Total Value: $${data.summary.total_value_usd.toLocaleString()}\n`;
    result += `  - Assets: $${data.summary.total_assets_usd.toLocaleString()}\n`;
    result += `  - Debts: $${data.summary.total_debts_usd.toLocaleString()}\n\n`;

    result += `**Protocols:**\n`;
    data.protocols.forEach((protocol: ProtocolHolding) => {
      result += `\n- **${protocol.protocol_name} on ${protocol.chain}**\n`;
      result += `  - Total Value: $${protocol.total_value_usd.toLocaleString()}\n`;
      protocol.tokens.forEach((token: TokenHolding) => {
        result += `    - ${token.token_symbol}: ${token.amount} ($${token.value_usd.toLocaleString()})\n`;
      });
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching DeFi holdings: ${errorMessage}`;
  }
}

/**
 * Get DeFi Holdings action.
 */
export class GetDefiHoldingsAction implements AgentkitAction<typeof GetDefiHoldingsInput> {
  public name = "get_defi_holdings";
  public description = GET_DEFI_HOLDINGS_PROMPT;
  public argsSchema = GetDefiHoldingsInput;
  public func = getDefiHoldings;
  public smartAccountRequired = false;
}
