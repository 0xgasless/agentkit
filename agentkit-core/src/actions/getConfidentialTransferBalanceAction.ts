import { z } from "zod";
import { BalancePayload, ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getWalletBalance } from "../services";
import { AgentkitAction } from "../agentkit";
import { tokenMappings, commonTokens } from "../constants";
import {
  BalanceParams,
  TokenConfig,
  BalanceChecker,
  SUPPORTED_CHAINS,
  SUPPORTED_TOKENS,
} from "petcrypt-js-lite";

const GET_CONFIDETIAL_BALANCE_PROMPT = `
This tool gets the balance of the smart account that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

You can check balances in two ways:
1. By token ticker symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)
2. By token contract addresses (e.g., "0x...")

EXAMPLES:
- "Check my confidential balance"
- "Check my private balance"
- "Check my private balance for USDC"

USAGE GUIDANCE:
- When a user asks to check his confidential balance, use this tool immediately without asking for confirmation
- If the user doesn't specify tokens, call the tool with USDC and get his confidential USDC balance.
- If the user mentions specific tokens by name (like "USDC" or "USDT"), prompt user that only USDC is supported for confidential transfer and by default use USDC as token symbol

Note: This action works on supported networks only Avalanche.
`;

export const RPC_URL = "https://1rpc.io/avax/c";
export const AVALANCHE_CHAIN_ID = 43114;

const getChainEnum = (chainId: number): SUPPORTED_CHAINS => {
  switch (chainId) {
    case 43114: // Avalanche C-Chain
      return SUPPORTED_CHAINS.AVALANCHE;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
};

const getTokenEnum = (): SUPPORTED_TOKENS => {
  return SUPPORTED_TOKENS.USDC; // Currently only USDC is supported for confidential transfers
};

const getConfidentialTokenBalance = async (
  smartAccount: `0x${string}`,
): Promise<BalancePayload> => {
  const balanceChecker = new BalanceChecker(RPC_URL);
  const tokenEnum = getTokenEnum();
  const chainEnum = getChainEnum(AVALANCHE_CHAIN_ID);
  const userBalanceParams: BalanceParams = {
    token: tokenEnum,
    chain: chainEnum,
    address: smartAccount,
  };
  const userBalance = await balanceChecker.getEERC20Balance(userBalanceParams);
  if (!userBalance) {
    throw new Error("Failed to fetch user balance");
  }
  const balancePayload: BalancePayload = {
    address: smartAccount,
    chainId: AVALANCHE_CHAIN_ID,
    amount: BigInt(userBalance),
    decimals: 6, // USDC has 6 decimals
    formattedAmount: (Number(userBalance) / 10 ** 6).toString(),
  };

  return balancePayload;
};

export const GetConfidentialBalanceInput = z
  .object({
    tokenAddresses: z
      .array(z.string())
      .optional()
      .describe("Optional list of token contract addresses to get balances for"),
    tokenSymbols: z
      .array(z.string())
      .optional()
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
export async function getConfidentialBalance(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetConfidentialBalanceInput>,
): Promise<string> {
  try {
    let tokenAddresses: `0x${string}`[] = [];
    const smartAccount = await wallet.getAddress();
    const chainId = wallet.rpcProvider.chain?.id;
    const chainEnum = getChainEnum(chainId || 43114); // Default to Avalanche C-Chain if chainId is not set
    const tokenEnum = getTokenEnum(); // Currently only USDC is supported for confidential transfers

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
    const confidentialTokenBalance = getConfidentialTokenBalance(smartAccount);
    const balances: BalancePayload[] = [];
    balances.push(await confidentialTokenBalance);

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
          if (chainId === 43114) {
            displayName = "AVAX";
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
      return `Smart Account: ${smartAccount}\n${responseTitle}\nNo non-zero balances found`;
    }

    return `Smart Account: ${smartAccount}\n${responseTitle}\n${balanceStrings.join("\n")}`;
  } catch (error) {
    console.error("Balance fetch error:", error);
    return `Error getting balance: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get wallet balance action.
 */
export class GetConfidentialBalanceAction implements AgentkitAction<typeof GetConfidentialBalanceInput> {
  public name = "get_confidential_balance";
  public description = GET_CONFIDETIAL_BALANCE_PROMPT;
  public argsSchema = GetConfidentialBalanceInput;
  public func = getConfidentialBalance;
  public smartAccountRequired = true;
}
