import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PAIRS_BY_TOKEN_ADDRESSES_PROMPT = `
Gets one or multiple pairs by token addresses from DexScreener API.

This tool retrieves detailed information about trading pairs for specific token addresses including:
- Chain and DEX information
- Base and quote token details
- Current prices (native and USD)
- Trading volume and transaction counts
- Price changes over different timeframes
- Liquidity information
- Market cap and FDV
- Social links and boost information

Requires:
- chainId: The blockchain chain identifier (e.g., "solana", "ethereum", "bsc")
- tokenAddresses: One or multiple comma-separated token addresses (up to 30 addresses)

This endpoint has a rate limit of 300 requests per minute.
`;

/**
 * Input schema for getting pairs by token addresses.
 */
export const GetPairsByTokenAddressesInput = z
  .object({
    chainId: z.string().describe("The blockchain chain identifier (e.g., solana, ethereum, bsc)"),
    tokenAddresses: z
      .string()
      .describe("One or multiple comma-separated token addresses (up to 30)"),
  })
  .strip()
  .describe("Get pairs by token addresses from DexScreener");

/**
 * Response interfaces for token pairs data.
 */
interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
}

interface QuoteToken {
  address: string | null;
  name: string | null;
  symbol: string | null;
}

interface TransactionData {
  buys: number;
  sells: number;
}

interface LiquidityData {
  usd: number | null;
  base: number;
  quote: number;
}

interface WebsiteInfo {
  url: string;
}

interface SocialInfo {
  platform: string;
  handle: string;
}

interface InfoData {
  imageUrl: string | null;
  websites: WebsiteInfo[] | null;
  socials: SocialInfo[] | null;
}

interface BoostData {
  active: number;
}

interface TokenPairData {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[] | null;
  baseToken: TokenInfo;
  quoteToken: QuoteToken;
  priceNative: string;
  priceUsd: string | null;
  txns: {
    h24: TransactionData;
    h6: TransactionData;
    h1: TransactionData;
    m5: TransactionData;
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  } | null;
  liquidity: LiquidityData | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  info: InfoData;
  boosts: BoostData;
}

/**
 * Gets pairs by token addresses from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chainId and tokenAddresses.
 * @returns A formatted string containing the pairs information for the tokens.
 */
export async function getPairsByTokenAddresses(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPairsByTokenAddressesInput>,
): Promise<string> {
  try {
    const { chainId, tokenAddresses } = args;

    // Validate inputs
    if (!chainId || !tokenAddresses) {
      return "Error: Both chainId and tokenAddresses are required.";
    }

    // Clean and validate token addresses
    const addresses = tokenAddresses
      .split(",")
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);

    if (addresses.length === 0) {
      return "Error: At least one token address is required.";
    }

    if (addresses.length > 30) {
      return "Error: Maximum of 30 token addresses allowed per request.";
    }

    const cleanAddresses = addresses.join(",");
    const url = `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(cleanAddresses)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return `No pairs found for the provided token addresses on chain ${chainId}.`;
      }
      return `Error fetching token pairs: ${response.status} ${response.statusText}`;
    }

    const data: TokenPairData[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return `No pairs found for the provided token addresses on chain ${chainId}.`;
    }

    let result = `🪙 Token Pairs on ${chainId.toUpperCase()}:\n\n`;
    result += `Found ${data.length} pair(s) for ${addresses.length} token address(es)\n\n`;

    // Group pairs by base token for better organization
    const pairsByToken = new Map<string, TokenPairData[]>();

    data.forEach(pair => {
      const tokenAddr = pair.baseToken.address;
      if (!pairsByToken.has(tokenAddr)) {
        pairsByToken.set(tokenAddr, []);
      }
      pairsByToken.get(tokenAddr)!.push(pair);
    });

    let tokenIndex = 1;
    pairsByToken.forEach((pairs, tokenAddress) => {
      const firstPair = pairs[0];
      result += `${tokenIndex}. 🪙 ${firstPair.baseToken.name} (${firstPair.baseToken.symbol})\n`;
      result += `   📍 Token Address: ${tokenAddress}\n`;
      result += `   💰 Found ${pairs.length} trading pair(s):\n\n`;

      pairs.forEach((pair, pairIndex) => {
        result += `   ${pairIndex + 1}. ${pair.baseToken.symbol}/${pair.quoteToken.symbol || "Unknown"} on ${pair.dexId.toUpperCase()}\n`;
        result += `      🔗 URL: ${pair.url}\n`;
        result += `      📍 Pair Address: ${pair.pairAddress}\n`;

        // Price Information
        if (pair.priceUsd) {
          result += `      💲 Price: $${pair.priceUsd}\n`;
        } else {
          result += `      💲 Price: ${pair.priceNative} (native)\n`;
        }

        // Volume and Transactions
        result += `      📊 24h Volume: ${formatNumber(pair.volume.h24)}\n`;
        result += `      📈 24h Txns: ${pair.txns.h24.buys + pair.txns.h24.sells} `;
        result += `(${pair.txns.h24.buys} buys, ${pair.txns.h24.sells} sells)\n`;

        // Price Change
        if (pair.priceChange?.h24 !== undefined) {
          const change = pair.priceChange.h24;
          const emoji = change >= 0 ? "📈" : "📉";
          result += `      ${emoji} 24h Change: ${formatPercentage(change)}%\n`;
        }

        // Market Data
        if (pair.liquidity?.usd && pair.liquidity.usd > 0) {
          result += `      💧 Liquidity: $${formatNumber(pair.liquidity.usd)}\n`;
        }

        if (pair.marketCap && pair.marketCap > 0) {
          result += `      🏢 Market Cap: $${formatNumber(pair.marketCap)}\n`;
        }

        if (pair.fdv && pair.fdv > 0) {
          result += `      💎 FDV: $${formatNumber(pair.fdv)}\n`;
        }

        // Active Boosts
        if (pair.boosts.active > 0) {
          result += `      🚀 Active Boosts: ${pair.boosts.active}\n`;
        }

        // Labels (if any)
        if (pair.labels && pair.labels.length > 0) {
          result += `      🏷️ Labels: ${pair.labels.join(", ")}\n`;
        }

        // Creation Date
        if (pair.pairCreatedAt) {
          result += `      📅 Created: ${formatTimestamp(pair.pairCreatedAt)}\n`;
        }

        result += "\n";
      });

      tokenIndex++;
      result += "\n";
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching token pairs: ${errorMessage}`;
  }
}

/**
 * Helper function to format large numbers.
 */
function formatNumber(num: number): string {
  if (num >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`;
  }
  if (num >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

/**
 * Helper function to format percentage changes.
 */
function formatPercentage(num: number): string {
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}`;
}

/**
 * Helper function to format timestamp.
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Get Pairs by Token Addresses action.
 */
export class GetPairsByTokenAddressesAction
  implements AgentkitAction<typeof GetPairsByTokenAddressesInput>
{
  public name = "get_pairs_by_token_addresses";
  public description = GET_PAIRS_BY_TOKEN_ADDRESSES_PROMPT;
  public argsSchema = GetPairsByTokenAddressesInput;
  public func = getPairsByTokenAddresses;
  public smartAccountRequired = false;
}
