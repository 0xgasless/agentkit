import { z } from "zod";
import { AgentkitAction } from "../agentkit";

const SELECT_SERVER_WALLET_PROMPT = `
This tool switches the currently active wallet to a different one by its index number.
Use the list_server_wallets tool first to see available wallets and their indices.

USAGE GUIDANCE:
- Provide the wallet index number you want to switch to
- The index must correspond to an existing wallet
- After switching, all transactions will use the newly selected wallet

This action only works when the agent is configured in server mode.
`;

export const SelectServerWalletInput = z
  .object({
    walletIndex: z.number().int().min(0).describe("The wallet index to switch to"),
  })
  .strip()
  .describe("Instructions for selecting a server wallet");

export async function selectServerWallet(
  agentkit: unknown, // Will be Agentkit instance
  args: z.infer<typeof SelectServerWalletInput>,
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
      setSelectedWalletIndex: (index: number) => void;
      getSelectedWalletIndex: () => number;
    };
    
    // Check if we're in server mode
    if (!agentkitTyped.isServerMode()) {
      return "Error: This action is only available in server mode. Please configure the agent with an API key.";
    }

    const previousIndex = agentkitTyped.getSelectedWalletIndex();
    agentkitTyped.setSelectedWalletIndex(args.walletIndex);
    
    return `Successfully switched from wallet index ${previousIndex} to wallet index ${args.walletIndex}. All future transactions will use wallet index ${args.walletIndex}.`;
  } catch (error) {
    console.error("Error selecting server wallet:", error);
    return `Error selecting wallet: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class SelectServerWalletAction implements AgentkitAction<typeof SelectServerWalletInput> {
  public name = "select_server_wallet";
  public description = SELECT_SERVER_WALLET_PROMPT;
  public argsSchema = SelectServerWalletInput;
  public func = selectServerWallet;
  public smartAccountRequired = false; // Server mode doesn't need a smart account
} 