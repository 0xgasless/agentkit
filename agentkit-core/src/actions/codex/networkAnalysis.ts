import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { createCodexClient, formatError } from "./utils";

const NETWORK_ANALYSIS_PROMPT = `
This tool provides comprehensive network analysis using Codex API. It can:
- Get available blockchain networks 
- Fetch network statistics
- Monitor network status

Required Setup:
- Set CODEX_API_KEY environment variable with your Codex API key

Input options:
- type: Type of analysis ('networks', 'networkStats', 'networkStatus')
- query: Exchange address (optional, for networkStats)
- networkId: Network ID (required for networkStats)
- networkIds: Array of network IDs (required for networkStatus)

Note: You must have a valid Codex API key set in your environment variables as CODEX_API_KEY.
`;

export const NetworkAnalysisInput = z
    .object({
        type: z.enum(["networks", "networkStats", "networkStatus"]),
        query: z.string().optional(),
        networkId: z.number().optional(),
        networkIds: z.array(z.number()).optional(),
    })
    .strip()
    .describe("Instructions for analyzing blockchain network data from Codex API");

interface Network {
    name: string;
    id: number;
}

interface NetworkStatus {
    networkId: number;
    networkName: string;
    lastProcessedBlock: number;
    lastProcessedTimestamp: number;
}
/**
 * Analyzes network data using Codex GraphQL API.
 */
export async function analyzeNetwork(args: z.infer<typeof NetworkAnalysisInput>): Promise<string> {
    try {
        const api = createCodexClient();

        switch (args.type) {
            case "networks": {
                const graphqlQuery = {
                    query: `{ getNetworks { name, id } }`
                };

                const response = await api.post("", graphqlQuery);
                const networks = response.data.data.getNetworks;
                return `Available Networks:\n${networks.map((network: Network) =>
                    `${network.name} (ID: ${network.id})`).join("\n")}`;
            }

            case "networkStats": {
                if (!args.networkId) throw new Error("Network ID is required for networkStats");

                const graphqlQuery = {
                    query: `
                    {
                      getNetworkStats(networkId: ${args.networkId}${args.query ? `, exchangeAddress: "${args.query}"` : ''}) {
                        liquidity
                        transactions1
                        transactions4
                        transactions12
                        transactions24
                        volume1
                        volume4
                        volume12
                        volume24
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const stats = response.data.data.getNetworkStats;

                return `Network Statistics:
                    Liquidity: $${parseFloat(stats.liquidity).toFixed(2)}
                    Transactions (1h/4h/12h/24h): ${stats.transactions1}/${stats.transactions4}/${stats.transactions12}/${stats.transactions24}
                    Volume 1h: $${parseFloat(stats.volume1).toFixed(2)}
                    Volume 4h: $${parseFloat(stats.volume4).toFixed(2)}
                    Volume 12h: $${parseFloat(stats.volume12).toFixed(2)}
                    Volume 24h: $${parseFloat(stats.volume24).toFixed(2)}
                `;
            }

            case "networkStatus": {
                if (!args.networkIds || args.networkIds.length === 0) throw new Error("Network IDs are required for networkStatus");

                const graphqlQuery = {
                    query: `
                    {
                      getNetworkStatus(networkIds: [${args.networkIds.join(',')}]) {
                        networkId
                        networkName
                        lastProcessedBlock
                        lastProcessedTimestamp
                      }
                    }`
                };

                const response = await api.post("", graphqlQuery);
                const statusList = response.data.data.getNetworkStatus;

                return `Network Status:\n${statusList.map((status: NetworkStatus) =>
                    `${status.networkName} (ID: ${status.networkId}):
                    Last Block: ${status.lastProcessedBlock}
                    Last Update: ${new Date(status.lastProcessedTimestamp * 1000).toISOString()}`
                ).join("\n\n")}`;
            }

            default:
                return `Unsupported analysis type: ${args.type}`;
        }
    } catch (error) {
        return formatError(error);
    }
}

/**
 * Network analysis action.
 */
export class NetworkAnalysisAction implements AgentkitAction<typeof NetworkAnalysisInput> {
    public name = "analyze_network";
    public description = NETWORK_ANALYSIS_PROMPT;
    public argsSchema = NetworkAnalysisInput;
    public func = analyzeNetwork;
    public smartAccountRequired = true;
} 