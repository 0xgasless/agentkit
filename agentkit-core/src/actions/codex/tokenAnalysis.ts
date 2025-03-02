import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { createCodexClient, formatError } from "./utils";

const TOKEN_ANALYSIS_PROMPT = `
This tool provides comprehensive token analysis using Codex API. It can:
- Fetch detailed token information and metadata
- Get token price and market data 
- Track liquidity pairs and trading activities
- Search for tokens by name, symbol, or address
- Filter and rank tokens based on various metrics

Required Setup:
- Set CODEX_API_KEY environment variable with your Codex API key

Input options:
- type: Type of analysis ('tokenInfo', 'priceData', 'pairData', 'searchTokens', 'filterTokens')
- query: Token address, pair address, or search term (required for most types)
- networkId: Network ID for token lookups (required for tokenInfo)
- limit: Maximum number of results to return (optional)
- lowVolumeFilter: Whether to filter out low volume results (optional for searchTokens)
- networkFilter: List of network IDs to filter by (optional for searchTokens)
- resolution: Time frame for token metadata (optional for searchTokens)

Note: You must have a valid Codex API key set in your environment variables as CODEX_API_KEY.
`;

export const TokenAnalysisInput = z
    .object({
        type: z.enum(["tokenInfo", "priceData", "pairData", "searchTokens", "filterTokens"]),
        query: z.string(),
        networkId: z.number().optional(),
        limit: z.number().optional().default(10),
        lowVolumeFilter: z.boolean().optional().default(true),
        networkFilter: z.array(z.number()).optional(),
        resolution: z.enum(["60", "240", "720", "1D"]).optional().default("1D"),
    })
    .strip()
    .describe("Instructions for analyzing token data from Codex API");

// Add these interfaces at the top of the file
interface TokenWithMetadata {
    name: string;
    symbol: string;
    address: string;
    networkId: number;
    price: number | string;
    priceChange: number | string;
    volume: number | string;
    liquidity: number | string;
    isScam?: boolean;
}

interface TokenFilterResult {
    token: {
        name: string;
        symbol: string;
        address: string;
        networkId: number;
    };
    priceUSD: string | number;
    change24: string | number;
    volume24: string | number;
    liquidity: string | number;
    txnCount24: number;
    uniqueBuys24: number;
    uniqueSells24: number;
    isScam?: boolean;
}

/**
 * Analyzes token data using Codex GraphQL API.
 */
export async function analyzeToken(args: z.infer<typeof TokenAnalysisInput>): Promise<string> {
    try {
        const api = createCodexClient();

        switch (args.type) {
            case "tokenInfo": {
                if (!args.networkId) throw new Error("Network ID is required for tokenInfo");

                const graphqlQuery = {
                    query: `
                    {
                      getTokenInfo(address: "${args.query}", networkId: ${args.networkId}) {
                        name
                        symbol
                        totalSupply
                        circulatingSupply
                        imageLargeUrl
                        isScam
                        description
                        networkId
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const token = response.data.data.getTokenInfo;

                return `Token Information:
                    Name: ${token.name}
                    Symbol: ${token.symbol}
                    Total Supply: ${token.totalSupply}
                    Circulating Supply: ${token.circulatingSupply || "N/A"}
                    Network ID: ${token.networkId}
                    Scam Flag: ${token.isScam ? "⚠️ Flagged as scam" : "Not flagged"}
                    ${token.description ? `Description: ${token.description}` : ""}
                `;
            }

            case "priceData": {
                const graphqlQuery = {
                    query: `
                    {
                      getToken(address: "${args.query}"${args.networkId ? `, networkId: ${args.networkId}` : ''}) {
                        symbol
                        priceUSD
                        priceChange24h
                        volumeUSD24h
                        marketCapUSD
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const token = response.data.data.getToken;

                return `Price Data for ${token.symbol}:
                    Price: $${parseFloat(token.priceUSD).toFixed(6)}
                    24h Change: ${parseFloat(token.priceChange24h).toFixed(2)}%
                    24h Volume: $${parseFloat(token.volumeUSD24h).toFixed(2)}
                    Market Cap: $${parseFloat(token.marketCapUSD).toFixed(2)}
                `;
            }

            case "pairData": {
                const graphqlQuery = {
                    query: `
                    {
                      getPair(id: "${args.query}") {
                        token0 {
                          symbol
                        }
                        token1 {
                          symbol
                        }
                        volumeUSD24h
                        reserveUSD
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const pair = response.data.data.getPair;

                return `Pair Data:
                    Tokens: ${pair.token0.symbol}/${pair.token1.symbol}
                    24h Volume: $${parseFloat(pair.volumeUSD24h).toFixed(2)}
                    Liquidity: $${parseFloat(pair.reserveUSD).toFixed(2)}
                `;
            }

            case "searchTokens": {
                const graphqlQuery = {
                    query: `
                    {
                      searchTokens(
                        search: "${args.query}"
                        limit: ${args.limit}
                        lowVolumeFilter: ${args.lowVolumeFilter}
                        ${args.networkFilter ? `networkFilter: [${args.networkFilter.join(',')}]` : ''}
                        resolution: "${args.resolution}"
                      ) {
                        hasMore
                        hasMoreLowVolume
                        tokens {
                          name
                          symbol
                          address
                          networkId
                          price
                          priceChange
                          volume
                          liquidity
                          isScam
                        }
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const searchResult = response.data.data.searchTokens;
                const tokens = searchResult.tokens;

                if (tokens.length === 0) {
                    return `No tokens found matching "${args.query}"`;
                }

                let result = `Search Results for "${args.query}":\n`;
                tokens.forEach((token: TokenWithMetadata, index: number) => {
                    result += `${index + 1}. ${token.name} (${token.symbol})
                        Address: ${token.address} (Network: ${token.networkId})
                        Price: $${parseFloat(token.price as string).toFixed(6)}
                        24h Change: ${parseFloat(token.priceChange as string).toFixed(2)}%
                        Volume: $${parseFloat(token.volume as string)}
                        Liquidity: $${parseFloat(token.liquidity as string)}
                        ${token.isScam ? "⚠️ Flagged as scam" : ""}
                    `;
                });

                if (searchResult.hasMore > 0 || searchResult.hasMoreLowVolume > 0) {
                    result += `\nAdditional results available: ${searchResult.hasMore + searchResult.hasMoreLowVolume} token(s)`;
                }

                return result;
            }

            case "filterTokens": {
                const graphqlQuery = {
                    query: `
                    {
                      filterTokens(
                        phrase: "${args.query}"
                        limit: ${args.limit}
                        offset: 0
                        rankings: [{field: VOLUME_24H, direction: DESC}]
                      ) {
                        count
                        page
                        results {
                          token {
                            name
                            symbol
                            address
                            networkId
                          }
                          priceUSD
                          change24
                          volume24
                          liquidity
                          txnCount24
                          uniqueBuys24
                          uniqueSells24
                          isScam
                        }
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const filterResult = response.data.data.filterTokens;
                const tokens = filterResult.results;

                if (tokens.length === 0) {
                    return `No tokens found matching filter criteria for "${args.query}"`;
                }

                let result = `Filtered Token Results for "${args.query}":\n`;
                tokens.forEach((item: TokenFilterResult, index: number) => {
                    const token = item.token;
                    result += `
${index + 1}. ${token.name} (${token.symbol})
   Address: ${token.address} (Network: ${token.networkId})
   Price: $${parseFloat(item.priceUSD as string).toFixed(6)}
   24h Change: ${parseFloat(item.change24 as string).toFixed(2)}%
   24h Volume: $${parseFloat(item.volume24 as string)}
   Liquidity: $${parseFloat(item.liquidity as string)}
   24h Transactions: ${item.txnCount24} (Buys: ${item.uniqueBuys24}, Sells: ${item.uniqueSells24})
   ${item.isScam ? "⚠️ Flagged as scam" : ""}
`;
                });

                result += `\nShowing ${tokens.length} of ${filterResult.count} results (page ${filterResult.page + 1})`;
                return result;
            }

            default:
                return `Unsupported analysis type: ${args.type}`;
        }
    } catch (error) {
        return formatError(error);
    }
}

/**
 * Token analysis action.
 */
export class TokenAnalysisAction implements AgentkitAction<typeof TokenAnalysisInput> {
    public name = "analyze_token";
    public description = TOKEN_ANALYSIS_PROMPT;
    public argsSchema = TokenAnalysisInput;
    public func = analyzeToken;
    public smartAccountRequired = true;
} 