import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../agentkit";

const GET_ADDRESS_PROMPT = `
This tool retrieves the smart account address that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

USAGE GUIDANCE:
- When a user asks for their wallet address, account address, or smart account address, use this tool immediately
- No parameters are needed to retrieve the address
- The address can be used for receiving tokens or for verification purposes
- This is a read-only operation that doesn't modify any blockchain state

Note: This action works on all supported networks (Base, Fantom, Moonbeam, Metis, Avalanche, BSC).
`;

export const GetAddressInput = z
  .object({})
  .strip()
  .describe("No input required to get the smart account address");

/**
 * Gets the smart account address.
 *
 * @returns A message containing the smart account address.
 */
export async function getAddress(
  walletOrAgentkit: ZeroXgaslessSmartAccount | unknown,
  _args: z.infer<typeof GetAddressInput>,
): Promise<string> {
  try {
    // Check if we're in server mode
    const isServerMode = walletOrAgentkit && 
      typeof walletOrAgentkit === 'object' && 
      'isServerMode' in walletOrAgentkit && 
      typeof (walletOrAgentkit as { isServerMode?: unknown }).isServerMode === 'function' &&
      (walletOrAgentkit as { isServerMode: () => boolean }).isServerMode();
    
    if (isServerMode) {
      // For server mode, we need to get the wallet address from the server
      const agentkitTyped = (walletOrAgentkit as unknown) as {
        getApiKey: () => string | undefined;
        getServerUrl: () => string | undefined;
        getSelectedWalletIndex: () => number;
      };
      
      const { ServerWalletService } = await import("../services/serverWalletService");
      const apiKey = agentkitTyped.getApiKey();
      const serverUrl = agentkitTyped.getServerUrl();
      const walletIndex = agentkitTyped.getSelectedWalletIndex();
      
      if (!apiKey || !serverUrl) {
        return "Error: Server configuration is incomplete. Missing API key or server URL.";
      }
      
      const serverService = new ServerWalletService(apiKey, serverUrl);
      const wallets = await serverService.listWallets();
      const currentWallet = wallets.find(w => w.accountIndex === walletIndex);
      
      if (!currentWallet) {
        return `Error: No wallet found at index ${walletIndex}. Use list_server_wallets to see available wallets.`;
      }
      
      return `Smart Account (Server Wallet Index ${walletIndex}): ${currentWallet.smartAddress}`;
    }
    
    // Local mode - existing implementation
    const wallet = walletOrAgentkit as ZeroXgaslessSmartAccount;
    const smartAccount = await wallet.getAddress();

    return `Smart Account: ${smartAccount}`;
  } catch (error) {
    console.error("Error getting address:", error);
    return `Error getting address: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get smart account address action.
 */
export class GetAddressAction implements AgentkitAction<typeof GetAddressInput> {
  public name = "get_address";
  public description = GET_ADDRESS_PROMPT;
  public argsSchema = GetAddressInput;
  public func = getAddress;
  public smartAccountRequired = false; // Works in both local and server mode
}
