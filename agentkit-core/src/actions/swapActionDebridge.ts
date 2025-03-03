import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { sendTransaction, waitForTransaction } from "../services";
import { AgentkitAction } from "../agentkit";
import { supportedChains, tokenMappings } from "../constants";
import { encodeFunctionData } from "viem";

const DEBRIDGE_SWAP_PROMPT = `
This tool allows you to swap tokens across different chains using DeBridge Liquidity Network (DLN).

Required inputs:
- srcChainTokenIn: Source token address or symbol (use 'eth' for native ETH)
- srcChainTokenInAmount: Amount of source token to swap (or 'auto' if specifying destination amount)
- dstChainTokenOut: Destination token address or symbol
- dstChainTokenOutAmount: Amount of destination token to receive (or 'auto' if specifying source amount)
- dstChainTokenOutRecipient: Address to receive the swapped tokens

Optional inputs:
- srcChainId: Source chain ID (defaults to current wallet chain)
- dstChainId: Destination chain ID
- wait: Whether to wait for transaction confirmation (default: false)
- affiliateFeePercent: Percentage of the fee to be paid to affiliateFeeRecipient (default: 0)
- affiliateFeeRecipient: Address to receive the affiliate fee

Supported networks:
- Avalanche (43114)
- BNB Chain (56)
- Metis (1088)
- Base (8453)
- Fantom (250)
- Moonbeam (1284)

Notes:
- One of srcChainTokenInAmount or dstChainTokenOutAmount must be a specific value (not both 'auto')
- The wallet must have sufficient balance of the source token
- Cross-chain swaps may take several minutes to complete
`;

/**
 * Create base schema without refinement
 */
const DebridgeSwapBaseSchema = z
  .object({
    srcChainTokenIn: z
      .string()
      .describe("The source token address or symbol (use 'eth' for native ETH)"),
    srcChainTokenInAmount: z
      .string()
      .describe("The amount of source token to swap (or 'auto' if specifying destination amount)"),
    dstChainTokenOut: z.string().describe("The destination token address or symbol"),
    dstChainTokenOutAmount: z
      .string()
      .default("auto")
      .describe(
        "The amount of destination token to receive (or 'auto' if specifying source amount)",
      ),
    dstChainTokenOutRecipient: z.string().describe("The address to receive the swapped tokens"),
    srcChainId: z
      .number()
      .optional()
      .describe("The source chain ID (defaults to current wallet chain)"),
    dstChainId: z.number().optional().describe("The destination chain ID"),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to wait for transaction confirmation"),
    affiliateFeePercent: z
      .number()
      .optional()
      .default(0)
      .describe("Percentage of the fee to be paid to affiliateFeeRecipient"),
    affiliateFeeRecipient: z.string().optional().describe("Address to receive the affiliate fee"),
  })
  .strip()
  .describe("Instructions for swapping tokens across different chains using DeBridge");

/**
 * Apply refinement for runtime validation
 */
export const DebridgeSwapInput = DebridgeSwapBaseSchema.refine(
  data => data.srcChainTokenInAmount !== "auto" || data.dstChainTokenOutAmount !== "auto",
  {
    message: "Either srcChainTokenInAmount or dstChainTokenOutAmount must be specified",
    path: ["srcChainTokenInAmount"],
  },
);

/**
 * Resolves a token symbol to its address for a specific chain
 * 
 * @param symbol The token symbol to resolve
 * @param chainId The chain ID to resolve the symbol on
 * @returns The token address or the original input if it appears to be an address
 */
function resolveTokenSymbol(symbol: string, chainId: number): string {
  // If input looks like an address, return it unchanged
  if (symbol.startsWith('0x') && symbol.length === 42) {
    return symbol;
  }
  
  // Handle ETH special case
  if (symbol.toLowerCase() === 'eth') {
    return "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  }
  
  // Lookup the symbol in tokenMappings
  if (tokenMappings[chainId] && tokenMappings[chainId][symbol.toUpperCase()]) {
    return tokenMappings[chainId][symbol.toUpperCase()];
  }
  
  // If we can't resolve it, return the original (will likely cause an API error)
  return symbol;
}

// Add minimum amount validation before attempting the swap
// These minimums are based on DeBridge's requirements to cover operational costs
const TOKEN_MINIMUMS: Record<string, Record<number, string>> = {
  "USDT": {
    43114: "1.0",    // Min 1 USDT on Avalanche
    56: "1.0",       // Min 1 USDT on BSC
    1: "0.5",        // Min 0.5 USDT on Ethereum
    10: "0.5",       // Min 0.5 USDT on Optimism
    42161: "0.5",    // Min 0.5 USDT on Arbitrum
  },
  "USDC": {
    43114: "1.0",    // Min 1 USDC on Avalanche
    56: "1.0",       // Min 1 USDC on BSC
    1: "0.5",        // Min 0.5 USDC on Ethereum
    // Add other chains as needed
  }
};

// Define a type for DeBridge errors
interface DeBridgeError extends Error {
  errorId?: string;
}

/**
 * Swaps tokens across different chains using DeBridge Liquidity Network.
 *
 * @param wallet - The smart account to use for the swap.
 * @param args - The input arguments for the swap.
 * @returns A message containing the swap details.
 */
export async function debridgeSwap(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DebridgeSwapInput>,
): Promise<string> {
  try {
    // Determine the source chain ID if not specified
    const srcChainId = args.srcChainId || wallet.rpcProvider.chain?.id;
    if (!srcChainId) {
      return "Error: Source chain ID could not be determined";
    }

    // Validate destination chain ID if specified
    if (args.dstChainId && !supportedChains[args.dstChainId]) {
      return `Error: Destination chain ID ${args.dstChainId} is not supported`;
    }

    // Resolve token symbols to addresses
    const srcTokenAddress = resolveTokenSymbol(args.srcChainTokenIn, srcChainId);
    const dstTokenAddress = resolveTokenSymbol(args.dstChainTokenOut, args.dstChainId || srcChainId);
    
    // Validate that we could resolve the tokens
    if (srcTokenAddress === args.srcChainTokenIn && !srcTokenAddress.startsWith('0x')) {
      return `Error: Could not resolve source token symbol "${args.srcChainTokenIn}" to an address on chain ${srcChainId}`;
    }
    
    if (dstTokenAddress === args.dstChainTokenOut && !dstTokenAddress.startsWith('0x')) {
      return `Error: Could not resolve destination token symbol "${args.dstChainTokenOut}" to an address on chain ${args.dstChainId}`;
    }

    // Convert token amount to integer format (no decimals)
    let srcTokenAmountInteger: string;
    if (args.srcChainTokenInAmount.toLowerCase() === 'auto') {
      srcTokenAmountInteger = 'auto';
    } else {
      try {
        // Get the token decimals
        let decimals = 18; // Default for most tokens
        
        // Special case for ETH
        if (srcTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          decimals = 18;
        } else {
          // For ERC20 tokens, read decimals from the contract
          try {
            const tokenDecimals = await wallet.rpcProvider.readContract({
              address: srcTokenAddress as `0x${string}`,
              abi: [
                {
                  name: 'decimals',
                  type: 'function',
                  inputs: [],
                  outputs: [{ type: 'uint8' }],
                  stateMutability: 'view',
                },
              ],
              functionName: 'decimals',
            });
            if (tokenDecimals !== undefined) {
              decimals = Number(tokenDecimals);
            }
          } catch (error) {
            console.warn(`Failed to get decimals for ${srcTokenAddress}, using default 18: ${error}`);
          }
        }
        
        // Convert the decimal amount to an integer
        const amountFloat = parseFloat(args.srcChainTokenInAmount);
        const amountInteger = Math.floor(amountFloat * Math.pow(10, decimals));
        srcTokenAmountInteger = amountInteger.toString();
        
        // Ensure it's a positive integer
        if (!/^[1-9]\d*$/.test(srcTokenAmountInteger)) {
          return `Error: Invalid amount. After conversion, got ${srcTokenAmountInteger} which is not a positive integer.`;
        }
      } catch (error) {
        return `Error: Failed to convert amount "${args.srcChainTokenInAmount}" to integer format: ${error}`;
      }
    }

    // Step 1: Check if approval is needed first and approve if necessary
    // This is only needed for ERC20 tokens, not for native tokens
    if (srcTokenAddress.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      try {
        const walletAddress = await wallet.getAddress();
        
        // First, let's check if we have the token balance
        const tokenContract = {
          address: srcTokenAddress as `0x${string}`,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              inputs: [{ type: 'address' }],
              outputs: [{ type: 'uint256' }],
              stateMutability: 'view',
            },
            {
              name: 'allowance',
              type: 'function',
              inputs: [{ type: 'address' }, { type: 'address' }],
              outputs: [{ type: 'uint256' }],
              stateMutability: 'view',
            },
            {
              name: 'approve',
              type: 'function',
              inputs: [{ type: 'address' }, { type: 'uint256' }],
              outputs: [{ type: 'bool' }],
              stateMutability: 'nonpayable',
            }
          ],
        };
        
        // Get token decimals
        let decimals = 18; // Default
        try {
          const tokenDecimals = await wallet.rpcProvider.readContract({
            address: srcTokenAddress as `0x${string}`,
            abi: [
              {
                name: 'decimals',
                type: 'function',
                inputs: [],
                outputs: [{ type: 'uint8' }],
                stateMutability: 'view',
              },
            ],
            functionName: 'decimals',
          });
          decimals = Number(tokenDecimals);
        } catch {
          console.warn(`Failed to get decimals for ${srcTokenAddress}, using default 18`);
        }
        
        // Check balance
        const balanceResult = await wallet.rpcProvider.readContract({
          ...tokenContract,
          functionName: 'balanceOf',
          args: [walletAddress],
        });
        // Ensure we can convert the result to a BigInt regardless of its type
        const balance = typeof balanceResult === 'bigint' 
          ? balanceResult 
          : BigInt(balanceResult?.toString() || '0');
        
        const amountBigInt = 
          args.srcChainTokenInAmount.toLowerCase() === 'auto' 
            ? balance 
            : BigInt(Math.floor(parseFloat(args.srcChainTokenInAmount) * 10**decimals));
            
        if (balance < amountBigInt) {
          return `Error: Insufficient token balance. Have ${balance.toString()} but need ${amountBigInt.toString()}`;
        }
        
        // Get DeBridge contract address from the API order endpoint
        // We'll use a placeholder for now, but will replace it with the actual contract address
        const debridge_contract = "0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251";
        
        // Check allowance
        const allowanceResult = await wallet.rpcProvider.readContract({
          ...tokenContract,
          functionName: 'allowance',
          args: [walletAddress, debridge_contract],
        });
        const allowance = typeof allowanceResult === 'bigint' 
          ? allowanceResult 
          : BigInt(allowanceResult?.toString() || '0');
        
        if (allowance < amountBigInt) {
          console.log(`Approving ${srcTokenAddress} for DeBridge swap...`);
          
          // Prepare approval transaction
          const approveTx: Transaction = {
            to: srcTokenAddress as `0x${string}`,
            data: encodeFunctionData({
              abi: tokenContract.abi,
              functionName: 'approve',
              args: [debridge_contract, amountBigInt],
            }),
            value: 0n,
          };
          
          // Send approval transaction
          console.log("Sending approval transaction:", approveTx);
          const approvalTxResponse = await sendTransaction(wallet, approveTx);
          
          if (!approvalTxResponse || !approvalTxResponse.success) {
            let errorMessage = "Unknown error during token approval";
            if (approvalTxResponse?.error) {
              if (typeof approvalTxResponse.error === 'object') {
                errorMessage = JSON.stringify(approvalTxResponse.error);
              } else {
                errorMessage = String(approvalTxResponse.error);
              }
            }
            return `Token approval failed: ${errorMessage}`;
          }
          
          // Wait for approval to be confirmed
          if (approvalTxResponse.userOpHash && args.wait) {
            console.log("Waiting for approval transaction to be confirmed...");
            await waitForTransaction(wallet, approvalTxResponse.userOpHash);
          }
        }
      } catch (error) {
        console.error("Error during token approval check:", error);
        return `Error during token approval check: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // In the function, before making API call
    const tokenKey = args.srcChainTokenIn.toUpperCase();
    const chainId = args.srcChainId || wallet.rpcProvider.chain?.id || 0;
    const minimumAmount = TOKEN_MINIMUMS[tokenKey]?.[chainId] || "1.0"; // Default to 1.0 if not specified

    if (parseFloat(args.srcChainTokenInAmount) < parseFloat(minimumAmount)) {
      return `Error: Amount too small for cross-chain swap. For ${tokenKey} on chain ${chainId}, the minimum amount is ${minimumAmount} to cover operational costs.`;
    }

    // Now proceed with the swap...
    // Prepare DeBridge API request data
    const deBridgeApiUrl = "https://dln.debridge.finance/v1.0/dln/order/create-tx";
    const walletAddress = await wallet.getAddress();

    // Build query parameters string
    const queryParams = new URLSearchParams({
      srcChainId: srcChainId.toString(),
      srcChainTokenIn: srcTokenAddress,
      srcChainTokenInAmount: srcTokenAmountInteger,
      dstChainId: args.dstChainId ? args.dstChainId.toString() : "",
      dstChainTokenOut: dstTokenAddress,
      dstChainTokenOutAmount: args.dstChainTokenOutAmount,
      dstChainTokenOutRecipient: args.dstChainTokenOutRecipient,
      srcChainOrderAuthorityAddress: walletAddress,
      dstChainOrderAuthorityAddress: args.dstChainTokenOutRecipient,
      prependOperatingExpense: "true",
      affiliateFeePercent: args.affiliateFeePercent.toString(),
    });

    if (args.affiliateFeeRecipient) {
      queryParams.append("affiliateFeeRecipient", args.affiliateFeeRecipient);
    }

    // Call DeBridge API to create transaction
    const response = await fetch(`${deBridgeApiUrl}?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    // Add proper error logging
    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.json();
        errorText = JSON.stringify(errorData);
        console.error("DeBridge API error:", errorData);
      } catch {
        errorText = await response.text();
        console.error("DeBridge API error (raw):", errorText);
      }
      return `Error creating DeBridge swap: ${errorText}`;
    }

    // Parse response as JSON
    const orderData = await response.json();
    console.log("DeBridge order data:", JSON.stringify(orderData, null, 2));

    if (!orderData.tx || !orderData.tx.to || !orderData.tx.data) {
      return `Error: Invalid response from DeBridge API: ${JSON.stringify(orderData)}`;
    }

    // Prepare transaction data without custom paymaster params
    const tx: Transaction = {
      to: orderData.tx.to as `0x${string}`,
      data: orderData.tx.data as `0x${string}`,
      value: BigInt(orderData.tx.value || "0"),
    };

    // Send transaction
    console.log("Sending transaction:", tx);
    const txResponse = await sendTransaction(wallet, tx);
    if (!txResponse || !txResponse.success) {
      let errorMessage = "Unknown error";
      if (txResponse?.error) {
        // Properly format error object
        if (typeof txResponse.error === 'object') {
          errorMessage = JSON.stringify(txResponse.error);
        } else {
          errorMessage = String(txResponse.error);
        }
      }
      return `Transaction failed: ${errorMessage}`;
    }

    // Wait for transaction if requested
    if (args.wait) {
      const status = await waitForTransaction(wallet, txResponse.userOpHash);
      if (status.status === "confirmed") {
        return `
        Successfully initiated DeBridge swap!
        
        From: ${args.srcChainTokenIn} (Chain ID: ${srcChainId})
        To: ${args.dstChainTokenOut} (Chain ID: ${args.dstChainId})
        Recipient: ${args.dstChainTokenOutRecipient}
        
        Transaction confirmed in block ${status.blockNumber}!
        Order ID: ${orderData.orderId}
        
        Note: Cross-chain swaps typically take a few minutes to complete.
        You can track the status of the swap using the order ID.
        `;
      } else {
        return `Transaction status: ${status.status}\n${status.error || ""}`;
      }
    }

    return `
    Successfully submitted DeBridge swap!
    
    From: ${args.srcChainTokenIn} (Chain ID: ${srcChainId})
    To: ${args.dstChainTokenOut} (Chain ID: ${args.dstChainId})
    Recipient: ${args.dstChainTokenOutRecipient}
    
    ${txResponse.message}
    Order ID: ${orderData.orderId}
    
    Note: Cross-chain swaps typically take a few minutes to complete.
    You can either:
    1. Check the status by asking: 
      - "What's the status of transaction ${txResponse.userOpHash}?"
      - "Check the status of DeBridge order ${orderData.orderId}"
    2. Or next time, instruct the agent to wait for confirmation using the 'wait' parameter
    `;
  } catch (error) {
    // Handle DeBridge specific errors
    if (error instanceof Error && 
        ((error as DeBridgeError).errorId === "ERROR_LOW_GIVE_AMOUNT" || 
         error.toString().includes("ERROR_LOW_GIVE_AMOUNT"))) {
      return `Error: The amount you're trying to swap (${args.srcChainTokenInAmount} ${args.srcChainTokenIn}) is too small to cover the operational costs of a cross-chain swap. Try increasing the amount to at least 1.0 ${args.srcChainTokenIn}.`;
    }
    
    // Regular error handling
    console.error("DeBridge API error:", error);
    return `Error creating DeBridge swap: ${JSON.stringify(error)}`;
  }
}

/**
 * DeBridge swap action.
 */
export class DebridgeSwapAction implements AgentkitAction<typeof DebridgeSwapBaseSchema> {
  public name = "debridge_swap";
  public description = DEBRIDGE_SWAP_PROMPT;
  public argsSchema = DebridgeSwapBaseSchema;
  public func = debridgeSwap;
  public smartAccountRequired = true;
}
