import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const SEARCH_PAIRS_PROMPT = `
Searches for pairs matching a query from DexScreener API.

This tool allows you to search for trading pairs using various criteria such as:
- Token symbols (e.g., "SOL/USDC", "ETH/USDT")
- Token names
- Token addresses
- Pair addresses

Returns detailed information about matching pairs including:
- Chain and DEX information
- Base and quote token details
- Current prices (native and USD)
- Trading volume and transaction counts
- Price changes over different timeframes
- Liquidity information
- Market cap and FDV
- Social links and boost information

Requires:
- query: The search query (e.g., "SOL/USDC", "Bitcoin", token address)

This endpoint has a rate limit of 300 requests per minute.
`;

/**
 * Input schema for searching pairs.
 */
export const SearchPairsInput = z
  .object({
    query: z.string().describe("Search query for pairs (e.g., SOL/USDC, token name, or address)"),
  })
  .strip()
  .describe("Search for pairs matching a query from DexScreener");

/**
 * Response interfaces for search pair data (reusing types from getPairsByChainAndAddress).
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

interface SearchPairData {
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

interface SearchPairsResponse {
  schemaVersion: string;
  pairs: SearchPairData[];
}

/**
 * Searches for pairs matching a query from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing the search query.
 * @returns A formatted string containing the search results.
 */
export async function searchPairs(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SearchPairsInput>,
): Promise<string> {
  try {
    const { query } = args;

    // Validate input
    if (!query || query.trim().length === 0) {
      return "Error: Search query is required.";
    }

    const searchParams = new URLSearchParams({ q: query.trim() });
    const url = `https://api.dexscreener.com/latest/dex/search?${searchParams}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      return `Error searching pairs: ${response.status} ${response.statusText}`;
    }

    const data: SearchPairsResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return `No pairs found matching query: "${query}"`;
    }

    let result = `🔍 Search Results for "${query}":\n\n`;
    result += `Found ${data.pairs.length} pair(s)\n\n`;

    // Show top 10 results to avoid overwhelming output
    const displayPairs = data.pairs.slice(0, 10);

    displayPairs.forEach((pair, index) => {
      result += `${index + 1}. ${pair.baseToken.symbol}/${pair.quoteToken.symbol || "Unknown"} (${pair.chainId.toUpperCase()})\n`;
      result += `   🏢 DEX: ${pair.dexId.toUpperCase()}\n`;
      result += `   📍 Address: ${pair.pairAddress}\n`;
      result += `   🔗 URL: ${pair.url}\n`;

      // Price Information
      if (pair.priceUsd) {
        result += `   💲 Price: $${pair.priceUsd}\n`;
      } else {
        result += `   💲 Price: ${pair.priceNative} (native)\n`;
      }

      // Volume and Transactions
      result += `   📊 24h Volume: ${formatNumber(pair.volume.h24)}\n`;
      result += `   📈 24h Transactions: ${pair.txns.h24.buys + pair.txns.h24.sells} (${pair.txns.h24.buys} buys, ${pair.txns.h24.sells} sells)\n`;

      // Price Change
      if (pair.priceChange?.h24 !== undefined) {
        const change = pair.priceChange.h24;
        const emoji = change >= 0 ? "📈" : "📉";
        result += `   ${emoji} 24h Change: ${formatPercentage(change)}%\n`;
      }

      // Market Data
      if (pair.liquidity?.usd && pair.liquidity.usd > 0) {
        result += `   💧 Liquidity: $${formatNumber(pair.liquidity.usd)}\n`;
      }

      if (pair.marketCap && pair.marketCap > 0) {
        result += `   🏢 Market Cap: $${formatNumber(pair.marketCap)}\n`;
      }

      // Active Boosts
      if (pair.boosts.active > 0) {
        result += `   🚀 Active Boosts: ${pair.boosts.active}\n`;
      }

      // Labels (if any)
      if (pair.labels && pair.labels.length > 0) {
        result += `   🏷️ Labels: ${pair.labels.join(", ")}\n`;
      }

      result += "\n";
    });

    if (data.pairs.length > 10) {
      result += `... and ${data.pairs.length - 10} more pairs found.\n`;
      result += `Tip: Use a more specific search query to narrow down results.\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error searching pairs: ${errorMessage}`;
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
 * Search Pairs action.
 */
export class SearchPairsAction implements AgentkitAction<typeof SearchPairsInput> {
  public name = "search_pairs";
  public description = SEARCH_PAIRS_PROMPT;
  public argsSchema = SearchPairsInput;
  public func = searchPairs;
  public smartAccountRequired = false;
}
