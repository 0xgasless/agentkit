import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_PAIRS_BY_CHAIN_AND_ADDRESS_PROMPT = `
Gets one or multiple pairs by chain and pair address from DexScreener API.

This tool retrieves detailed information about trading pairs including:
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
- pairId: The pair address/identifier

This endpoint has a rate limit of 300 requests per minute.
`;

/**
 * Input schema for getting pairs by chain and address.
 */
export const GetPairsByChainAndAddressInput = z
  .object({
    chainId: z.string().describe("The blockchain chain identifier (e.g., solana, ethereum, bsc)"),
    pairId: z.string().describe("The pair address/identifier"),
  })
  .strip()
  .describe("Get pairs by chain and pair address from DexScreener");

/**
 * Response interfaces for pair data.
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

interface PairData {
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

interface PairsResponse {
  schemaVersion: string;
  pairs: PairData[] | null;
}

/**
 * Gets pairs by chain and pair address from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param args - The input arguments containing chainId and pairId.
 * @returns A formatted string containing the pair information.
 */
export async function getPairsByChainAndAddress(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetPairsByChainAndAddressInput>,
): Promise<string> {
  try {
    const { chainId, pairId } = args;

    // Validate inputs
    if (!chainId || !pairId) {
      return "Error: Both chainId and pairId are required.";
    }

    const url = `https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return `No pair found for ${pairId} on chain ${chainId}.`;
      }
      return `Error fetching pair data: ${response.status} ${response.statusText}`;
    }

    const data: PairsResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return `No pair data found for ${pairId} on chain ${chainId}.`;
    }

    let result = `💰 Pair Information for ${chainId}/${pairId}:\n\n`;

    data.pairs.forEach((pair, index) => {
      result += `${index + 1}. ${pair.baseToken.symbol}/${pair.quoteToken.symbol || "Unknown"} on ${pair.dexId.toUpperCase()}\n`;
      result += `   📍 Pair Address: ${pair.pairAddress}\n`;
      result += `   🔗 URL: ${pair.url}\n`;
      result += `   \n`;

      // Token Information
      result += `   🪙 Base Token: ${pair.baseToken.name} (${pair.baseToken.symbol})\n`;
      result += `   💵 Quote Token: ${pair.quoteToken.name || "Unknown"} (${pair.quoteToken.symbol || "Unknown"})\n`;
      result += `   \n`;

      // Price Information
      result += `   💲 Price:\n`;
      result += `      • Native: ${pair.priceNative}\n`;
      if (pair.priceUsd) {
        result += `      • USD: $${pair.priceUsd}\n`;
      }
      result += `   \n`;

      // Volume Information
      result += `   📊 Volume (24h): ${formatNumber(pair.volume.h24)}\n`;
      result += `   📈 Transactions (24h): ${pair.txns.h24.buys} buys, ${pair.txns.h24.sells} sells\n`;
      result += `   \n`;

      // Price Changes
      if (pair.priceChange) {
        result += `   📉 Price Changes:\n`;
        result += `      • 1h: ${formatPercentage(pair.priceChange.h1)}%\n`;
        result += `      • 6h: ${formatPercentage(pair.priceChange.h6)}%\n`;
        result += `      • 24h: ${formatPercentage(pair.priceChange.h24)}%\n`;
        result += `   \n`;
      }

      // Market Data
      if (pair.liquidity?.usd) {
        result += `   💧 Liquidity: $${formatNumber(pair.liquidity.usd)}\n`;
      }
      if (pair.marketCap) {
        result += `   🏢 Market Cap: $${formatNumber(pair.marketCap)}\n`;
      }
      if (pair.fdv) {
        result += `   💎 FDV: $${formatNumber(pair.fdv)}\n`;
      }

      // Boost Information
      if (pair.boosts.active > 0) {
        result += `   🚀 Active Boosts: ${pair.boosts.active}\n`;
      }

      // Creation Date
      if (pair.pairCreatedAt) {
        result += `   📅 Created: ${formatTimestamp(pair.pairCreatedAt)}\n`;
      }

      result += `\n`;
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching pair data: ${errorMessage}`;
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
 * Get Pairs by Chain and Address action.
 */
export class GetPairsByChainAndAddressAction
  implements AgentkitAction<typeof GetPairsByChainAndAddressInput>
{
  public name = "get_pairs_by_chain_and_address";
  public description = GET_PAIRS_BY_CHAIN_AND_ADDRESS_PROMPT;
  public argsSchema = GetPairsByChainAndAddressInput;
  public func = getPairsByChainAndAddress;
  public smartAccountRequired = false;
}
