import { z } from "zod";
import { AgentkitAction } from "../agentkit";
import { ServerWalletService } from "../services/serverWalletService";

const LIST_SERVER_WALLETS_PROMPT = `
This tool lists all smart wallets available on the server for your agent.
Each wallet has an index number that can be used to select it for transactions.

USAGE GUIDANCE:
- Use this tool to see all available wallets and their addresses
- The response will show wallet index, address, and creation date
- Note the index number if you want to switch to a different wallet

This action only works when the agent is configured in server mode.
`;

export const ListServerWalletsInput = z
  .object({})
  .strip()
  .describe("No input required to list server wallets");

export async function listServerWallets(
  agentkit: unknown, // Will be Agentkit instance
  _args: z.infer<typeof ListServerWalletsInput>,
): Promise<string> {
  try {
    // Type guard to check if agentkit has the required methods
    if (!agentkit || typeof agentkit !== 'object' || 
        !('isServerMode' in agentkit) || 
        typeof (agentkit as { isServerMode?: unknown }).isServerMode !== 'function') {
      return "Error: Invalid agentkit instance provided.";
    }
    
    const agentkitTyped = agentkit as {
      isServerMode: () => boolean;
      getApiKey: () => string | undefined;
      getServerUrl: () => string | undefined;
      getSelectedWalletIndex: () => number;
    };
    
    // Check if we're in server mode
    if (!agentkitTyped.isServerMode()) {
      return "Error: This action is only available in server mode. Please configure the agent with an API key.";
    }

    const apiKey = agentkitTyped.getApiKey();
    const serverUrl = agentkitTyped.getServerUrl();
    
    if (!apiKey || !serverUrl) {
      return "Error: Server configuration is incomplete. Missing API key or server URL.";
    }

    const serverService = new ServerWalletService(apiKey, serverUrl);
    const wallets = await serverService.listWallets();

    if (!wallets || wallets.length === 0) {
      return "No wallets found. You may need to create a wallet first.";
    }

    const currentIndex = agentkitTyped.getSelectedWalletIndex();
    
    const walletList = wallets
      .map(wallet => {
        const isCurrent = wallet.accountIndex === currentIndex ? " (CURRENT)" : "";
        return `Index ${wallet.accountIndex}${isCurrent}: ${wallet.smartAddress}`;
      })
      .join("\n");

    return `Available Wallets:\n${walletList}\n\nCurrently selected wallet index: ${currentIndex}`;
  } catch (error) {
    console.error("Error listing server wallets:", error);
    return `Error listing wallets: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class ListServerWalletsAction implements AgentkitAction<typeof ListServerWalletsInput> {
  public name = "list_server_wallets";
  public description = LIST_SERVER_WALLETS_PROMPT;
  public argsSchema = ListServerWalletsInput;
  public func = listServerWallets;
  public smartAccountRequired = false; // Server mode doesn't need a smart account
} 