import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getWalletBalance, isEoaMode, getActiveAddress } from "../services";
import { AgentkitAction } from "../agentkit";
import { tokenMappings, commonTokens } from "../constants";

const GET_BALANCE_PROMPT = `
This tool gets the balance of the smart account that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

You can check balances in three ways:
1. By default, it returns balances for all supported tokens on the current chain
2. By token ticker symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)
3. By token contract addresses (e.g., "0x...")

USAGE GUIDANCE:
- When a user asks to check or get balances, use this tool immediately without asking for confirmation
- If the user doesn't specify tokens, call the tool with no parameters to get ALL token balances
- If the user mentions specific tokens by name (like "USDC" or "USDT"), use the tokenSymbols parameter
- Only use tokenAddresses parameter if the user specifically provides contract addresses

Note: This action works on supported networks only (Base, Sonic, Moonbeam, Avalanche, BSC).
`;

export const GetBalanceInput = z
  .object({
    tokenAddresses: z
      .array(z.string())
      .optional()
      .nullable()
      .describe("Optional list of token contract addresses to get balances for"),
    tokenSymbols: z
      .array(z.string())
      .optional()
      .nullable()
      .describe(
        "Optional list of token symbols (e.g., 'USDC', 'USDT', 'WETH') to get balances for",
      ),
  })
  .strip()
  .describe("Instructions for getting smart account balance");

/**
 * Resolves token symbols to their contract addresses based on the current chain
 *
 * @param wallet - The smart account to get chain information from
 * @param symbols - Array of token symbols to resolve
 * @returns Array of token addresses
 */
async function resolveTokenSymbols(
  wallet: ZeroXgaslessSmartAccount,
  symbols: string[],
): Promise<`0x${string}`[]> {
  const chainId = wallet.rpcProvider.chain?.id;
  if (!chainId || !tokenMappings[chainId]) {
    console.warn(`Chain ID ${chainId} not found in token mappings`);
    return [];
  }

  const chainTokens = tokenMappings[chainId];
  const resolvedAddresses: `0x${string}`[] = [];

  for (const symbol of symbols) {
    const normalizedSymbol = symbol.toUpperCase();
    if (chainTokens[normalizedSymbol]) {
      resolvedAddresses.push(chainTokens[normalizedSymbol]);
    } else {
      console.warn(`Token symbol ${normalizedSymbol} not found for chain ID ${chainId}`);
    }
  }

  return resolvedAddresses;
}

/**
 * Gets balance for the smart account.
 *
 * @param wallet - The smart account to get the balance for.
 * @param args - The input arguments for the action.
 * @returns A message containing the balance information.
 */
export async function getBalance(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetBalanceInput>,
): Promise<string> {
  try {
    let tokenAddresses: `0x${string}`[] = [];
    const activeAddress = await getActiveAddress(wallet);
    const chainId = wallet.rpcProvider.chain?.id;

    // If no specific tokens requested, get all tokens from tokenMappings for the current chain
    if (
      (!args.tokenAddresses || args.tokenAddresses.length === 0) &&
      (!args.tokenSymbols || args.tokenSymbols.length === 0)
    ) {
      if (chainId && tokenMappings[chainId]) {
        // Get all token addresses for the current chain
        tokenAddresses = [...tokenAddresses, ...Object.values(tokenMappings[chainId])];
      } else {
        console.warn(`Chain ID ${chainId} not found in token mappings or is empty`);
      }
    } else {
      // Process token addresses if provided
      if (args.tokenAddresses && args.tokenAddresses.length > 0) {
        tokenAddresses = args.tokenAddresses.map(addr => addr as `0x${string}`);
      }

      // Process token symbols if provided
      if (args.tokenSymbols && args.tokenSymbols.length > 0) {
        const symbolAddresses = await resolveTokenSymbols(wallet, args.tokenSymbols);
        tokenAddresses = [...tokenAddresses, ...symbolAddresses];
      }
    }

    // Remove duplicates
    tokenAddresses = [...new Set(tokenAddresses)];

    const balances = await getWalletBalance(
      wallet,
      tokenAddresses.length > 0 ? tokenAddresses : undefined,
    );
    if (!balances) {
      return "Error getting balance: No balance information returned from the provider";
    }

    if (balances.length === 0) {
      return "No balances found for the requested tokens";
    }

    // Format the balance response
    const balanceStrings = balances
      // Filter out zero balances unless explicitly requested specific tokens
      .filter(balance => {
        // If user requested specific tokens, show all balances including zeros
        if (
          (args.tokenAddresses && args.tokenAddresses.length > 0) ||
          (args.tokenSymbols && args.tokenSymbols.length > 0)
        ) {
          return true;
        }
        // Otherwise, only show non-zero balances
        return balance.formattedAmount !== "0" && balance.formattedAmount !== "0.0";
      })
      .map(balance => {
        // Try to find a symbol for this address
        const chainId = wallet.rpcProvider.chain?.id;
        let displayName = balance.address;

        // Special case for native token (ETH, BNB, etc.)
        if (balance.address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
          // Use chain-specific native token name if available
          if (chainId === 56) {
            displayName = "BNB";
          } else if (chainId === 43114) {
            displayName = "AVAX";
          } else if (chainId === 156) {
            displayName = "S";
          } else if (chainId === 43113) {
            displayName = "AVAX";
          } else if (chainId === 8453) {
            displayName = "ETH";
          } else if (chainId === 1284) {
            displayName = "GLMR";
          } else {
            displayName = "ETH";
          }
        } else if (chainId && tokenMappings[chainId]) {
          const chainTokens = tokenMappings[chainId];
          // Find token symbol by address
          for (const [symbol, address] of Object.entries(chainTokens)) {
            if (address.toLowerCase() === balance.address.toLowerCase()) {
              displayName = symbol;
              break;
            }
          }
        }

        return `${displayName}: ${balance.formattedAmount}`;
      });

    // Sort balances alphabetically by token name for better readability
    balanceStrings.sort();

    const responseTitle =
      tokenAddresses.length > 0 && !args.tokenAddresses?.length && !args.tokenSymbols?.length
        ? "All Token Balances:"
        : "Balances:";

    if (balanceStrings.length === 0) {
      const label = isEoaMode() ? "EOA" : "Smart Account";
      return `${label}: ${activeAddress}\n${responseTitle}\nNo non-zero balances found`;
    }

    const label = isEoaMode() ? "EOA" : "Smart Account";
    return `${label}: ${activeAddress}\n${responseTitle}\n${balanceStrings.join("\n")}`;
  } catch (error) {
    console.error("Balance fetch error:", error);
    return `Error getting balance: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get wallet balance action.
 */
export class GetBalanceAction implements AgentkitAction<typeof GetBalanceInput> {
  public name = "get_balance";
  public description = GET_BALANCE_PROMPT;
  public argsSchema = GetBalanceInput;
  public func = getBalance;
  public smartAccountRequired = true;
}
