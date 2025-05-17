import { z } from "zod";
import { Transaction, ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import {
  sendTransaction,
  formatTokenAmount,
  checkAndApproveTokenAllowance,
  // We might need resolveTokenSymbol if we add symbol support later
  // resolveTokenSymbol,
} from "../../services";

const BRIDGE_PROMPT = `
This tool allows you to bridge tokens cross-chain using Debridge DLN.

You need to provide:
- Source and destination chain IDs (e.g., 1 for Ethereum, 137 for Polygon)
- Token addresses for the input and output tokens
- The amount of the input token to bridge

USAGE GUIDANCE:
- Specify 'fromChainId', 'toChainId', 'tokenInAddress', 'tokenOutAddress', and 'amount'.
- Optionally, you can provide a 'recipientAddress' for the tokens on the destination chain. If not provided, tokens will be sent to your agent's wallet address.
- Optionally, set a custom 'slippage' (e.g., "0.5" for 0.5%). Default is "1".
- Optionally, set 'approveMax: true' to approve maximum token allowance for the input token. Default is false.
- Optionally, set 'payProtocolFee: true' to include the deBridge protocol fee. Default is true. NOTE: The smart account MUST have enough NATIVE currency (e.g., BNB, ETH) to cover this fee.

EXAMPLES:
- Bridge 100 USDC from Ethereum (1) to Polygon (137) for DAI: 
  "Bridge 100 USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) on chain 1 to DAI (0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063) on chain 137"
  (Assuming the tool maps this to the correct JSON input with chain IDs and token addresses)

Note: This action works with Debridge DLN supported chains and tokens.
All transactions on the source chain are gasless if using a 0xgasless smart account, BUT the deBridge protocol itself charges a fixed native currency fee (e.g., 0.005 BNB) that must be available in the smart account.
The tool will submit the transaction and wait for confirmation by default.
`;

export const SmartBridgeInput = z
  .object({
    fromChainId: z
      .number()
      .int()
      .positive()
      .describe("The ID of the source chain (e.g., 1 for Ethereum)"),
    toChainId: z
      .number()
      .int()
      .positive()
      .describe("The ID of the destination chain (e.g., 137 for Polygon)"),
    tokenInAddress: z
      .string()
      .startsWith("0x")
      .length(42)
      .describe("The address of the input token on the source chain"),
    tokenOutAddress: z
      .string()
      .startsWith("0x")
      .length(42)
      .describe("The address of the output token on the destination chain"),
    amount: z
      .string()
      .describe("The amount of input token to bridge (human-readable, e.g., '100')"),
    recipientAddress: z
      .string()
      .startsWith("0x")
      .length(42)
      .optional()
      .describe(
        "Optional: The address to receive tokens on the destination chain. Defaults to your wallet address.",
      ),
    slippage: z
      .string()
      .optional()
      .default("1") // Defaulting to 1%
      .describe(
        "Optional: Slippage tolerance in percentage (e.g., '0.5' for 0.5%). Default is '1'.",
      ),
    approveMax: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Optional: Whether to approve maximum token allowance for the input token. Default is false.",
      ),
    payProtocolFee: z
      .boolean()
      .optional()
      .default(true) // CHANGED: Default to true as deBridge requires this native fee.
      .describe(
        "Optional: Whether to include the deBridge protocol fee. Default is true. Smart account needs NATIVE currency for this.",
      ),
  })
  .strip()
  .describe("Instructions for bridging tokens cross-chain via Debridge DLN");

export async function smartBridge(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartBridgeInput>,
): Promise<string> {
  // Implementation to follow based on the plan
  try {
    const currentChainId = wallet.rpcProvider.chain?.id;
    if (!currentChainId) {
      return "Error: Unable to determine the current chain ID from the wallet.";
    }
    if (currentChainId !== args.fromChainId) {
      return `Error: Wallet is connected to chain ${currentChainId}, but the 'fromChainId' is ${args.fromChainId}. Please ensure the wallet is on the correct source chain.`;
    }

    const senderAddress = await wallet.getAddress();
    const recipient = args.recipientAddress || senderAddress;

    // 1. Format Amount (We'll need token details for this, Debridge might return them or we fetch them)
    // For now, let's assume Debridge API will handle the raw amount if we can't get decimals easily before the first API call.
    // Or, the Debridge create-tx might take unformatted amount and srcChainTokenInDecimals.
    // The existing swap.ts uses formatTokenAmount which requires tokenInAddress and wallet.
    // Let's try to use it.
    let formattedAmount: string;
    try {
      formattedAmount = await formatTokenAmount(
        wallet,
        args.tokenInAddress as `0x${string}`,
        args.amount,
      );
    } catch (error) {
      console.error("Error formatting token amount:", error);
      return `Error: Could not format token amount for ${args.tokenInAddress}. Ensure it's a valid token address and you have balance. Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 2. Construct Debridge API URL
    const debridgeApiBaseUrl = "https://dln.debridge.finance/v1.0/dln/order/create-tx";
    const queryParams = new URLSearchParams({
      srcChainId: args.fromChainId.toString(),
      dstChainId: args.toChainId.toString(),
      srcChainTokenIn: args.tokenInAddress,
      srcChainTokenInAmount: formattedAmount, // Using formatted amount
      dstChainTokenOut: args.tokenOutAddress,
      dstChainTokenOutRecipient: recipient,
      slippage: args.slippage,
      senderAddress: senderAddress, // Required by create-tx
      // Explicitly set authority addresses to ensure we get the final transaction
      srcChainOrderAuthorityAddress: senderAddress,
      dstChainOrderAuthorityAddress: recipient,
      referralCode: "31676",
      // affiliateFeePercent: "0", // Optional, defaults to 0
    });
    const debridgeApiUrl = `${debridgeApiBaseUrl}?${queryParams.toString()}`;

    // 3. Call Debridge API
    let apiResponseData;
    try {
      console.log("Calling Debridge API:", debridgeApiUrl);
      const response = await fetch(debridgeApiUrl);
      apiResponseData = await response.json();

      if (!response.ok) {
        console.error("Debridge API Error Response:", apiResponseData);
        const errorDetail =
          apiResponseData.error ||
          apiResponseData.message ||
          JSON.stringify(apiResponseData.details || apiResponseData);
        if (
          typeof errorDetail === "string" &&
          errorDetail.toLowerCase().includes("minimum trade amount is")
        ) {
          return `Error from Debridge API: ${errorDetail}. The amount might be too small.`;
        }
        if (
          typeof errorDetail === "string" &&
          errorDetail.toLowerCase().includes("can not estimate with 0 amount")
        ) {
          return `Error from Debridge API: ${errorDetail}. The input amount seems to be zero after formatting.`;
        }
        return `Error from Debridge API (${response.status}): ${errorDetail}`;
      }

      // Validate that we have tx data
      if (!apiResponseData.tx) {
        console.error("Debridge API response missing tx:", apiResponseData);
        return "Error: Debridge API response is incomplete. Missing transaction data.";
      }
    } catch (error) {
      console.error("Error calling Debridge API:", error);
      return `Error calling Debridge API: ${error instanceof Error ? error.message : String(error)}`;
    }

    const { tx } = apiResponseData;
    
    // 4. Check if we need to handle a preliminary approval (for non-reserve assets)
    // This will be indicated by tx having allowanceTarget and allowanceValue instead of to/data/value
    if (tx.allowanceTarget && tx.allowanceValue) {
      console.log("Debridge API response suggests a preliminary approval is needed (likely for non-reserve asset pre-swap):");
      console.log(`  Token to approve: ${args.tokenInAddress}`);
      console.log(`  Spender: ${tx.allowanceTarget}`);
      console.log(`  Amount: ${tx.allowanceValue}`);
      
      // 4a. Perform the preliminary approval for a Pre-Order-Swap
      try {
        const approvalResult = await checkAndApproveTokenAllowance(
          wallet,
          args.tokenInAddress as `0x${string}`,
          tx.allowanceTarget as `0x${string}`,
          BigInt(tx.allowanceValue), // Amount to approve from API
          true, // Always approveMax for DeFi operations
        );

        if (!approvalResult.success) {
          return `Failed to approve preliminary token spending for ${args.tokenInAddress} to ${tx.allowanceTarget}: ${approvalResult.error}`;
        }

        console.log(
          `Preliminary token approval successful for ${args.tokenInAddress} to ${tx.allowanceTarget}. UserOpHash: ${approvalResult.userOpHash}`,
        );
      } catch (error) {
        console.error("Error during preliminary token approval:", error);
        return `Error during preliminary token approval: ${error instanceof Error ? error.message : String(error)}`;
      }

      // 4b. Call the Debridge API again with the same parameters to get the actual transaction
      try {
        console.log("Calling Debridge API again after preliminary approval to get final transaction data...");
        const secondResponse = await fetch(debridgeApiUrl);
        const secondApiResponseData = await secondResponse.json();

        if (!secondResponse.ok) {
          console.error("Second Debridge API Error Response:", secondApiResponseData);
          const errorDetail =
            secondApiResponseData.error ||
            secondApiResponseData.message ||
            JSON.stringify(secondApiResponseData.details || secondApiResponseData);
          return `Error from Debridge API on second call (${secondResponse.status}): ${errorDetail}`;
        }

        // Validate that we now have the actual tx data (to, data, value)
        if (!secondApiResponseData.tx || !secondApiResponseData.tx.to) {
          console.error("Second Debridge API response still missing proper tx data (expected 'to', 'data', 'value'):", secondApiResponseData);
          return "Error: Debridge API response after preliminary approval is still incomplete. Missing proper transaction data.";
        }

        // Update our tx and estimation with the new data
        apiResponseData = secondApiResponseData;
        console.log("Successfully received final transaction data from second API call.");
      } catch (error) {
        console.error("Error calling Debridge API after preliminary approval:", error);
        return `Error calling Debridge API after preliminary approval: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // Re-extract tx and estimation from the updated apiResponseData
    const { tx: finalTx, estimation, fixFee } = apiResponseData;
    const { recommendedSlippage, srcChainTokenIn, dstChainTokenOut } = estimation || {};

    // Check and log the protocol fee information
    let protocolFeeInfo = "";
    let nativeFeeAmount = 0n;
    if (fixFee) {
      nativeFeeAmount = BigInt(fixFee);
      const formattedFee = formatBigIntToEth(nativeFeeAmount);
      console.log(`deBridge API reported fixed protocol fee (fixFee): ${formattedFee} native currency (${fixFee} wei)`);
      protocolFeeInfo = `deBridge protocol fee: ${formattedFee} native currency`;
    }
    if (finalTx.value) {
      const txValue = BigInt(finalTx.value);
      console.log(`Transaction.value from API: ${formatBigIntToEth(txValue)} native currency (${finalTx.value} wei)`);
      if (!fixFee && txValue > 0n) {
        nativeFeeAmount = txValue; // Use tx.value if fixFee wasn't present but tx.value is
        protocolFeeInfo = `deBridge protocol fee (from tx.value): ${formatBigIntToEth(txValue)} native currency`;
      }
      // If we have both fixFee and tx.value, verify they're at least related or equal
      if (fixFee && nativeFeeAmount > 0n && txValue !== nativeFeeAmount) {
        console.warn(`Warning: Transaction.value (${finalTx.value}) from API differs from reported fixFee (${fixFee}). Using tx.value for fee if payProtocolFee is true.`);
        nativeFeeAmount = txValue; // Prioritize tx.value if different and present
      }
    }

    // 5. Token Approval for the main transaction (Source Chain)
    const spenderAddress = finalTx.to as `0x${string}`;
    const approvalResult = await checkAndApproveTokenAllowance(
      wallet,
      args.tokenInAddress as `0x${string}`,
      spenderAddress,
      BigInt(formattedAmount), // Amount to approve
      true, // Always approve max for DeFi operations
    );

    if (!approvalResult.success) {
      return `Failed to approve token spending for ${args.tokenInAddress} to main contract ${spenderAddress}: ${approvalResult.error}`;
    }

    if (approvalResult.userOpHash) {
      console.log(
        `Main token approval successful for ${args.tokenInAddress} to ${spenderAddress}. UserOpHash: ${approvalResult.userOpHash}`,
      );
    }

    // 6. Send Transaction (Source Chain)
    const transactionValue = args.payProtocolFee ? nativeFeeAmount : 0n;
    
    if (!args.payProtocolFee && nativeFeeAmount > 0n) {
      console.log(`User has set payProtocolFee to false. Overriding transaction value from ${nativeFeeAmount.toString()} to 0.`);
      console.log(`This is to ensure compatibility with paymasters that may not sponsor transactions with a native value.`);
    } else if (args.payProtocolFee && nativeFeeAmount === 0n && finalTx.value && BigInt(finalTx.value) > 0n) {
      console.warn(`Warning: payProtocolFee is true, but calculated nativeFeeAmount is 0. However, finalTx.value from API is ${finalTx.value}. Consider if this fee should be paid.`);
    } else if (args.payProtocolFee && nativeFeeAmount > 0n) {
      console.log(`Including deBridge protocol fee of ${nativeFeeAmount.toString()} wei in transaction value.`);
    }

    const transactionToSubmit: Transaction = {
      to: finalTx.to as `0x${string}`,
      data: (finalTx.data as `0x${string}` | undefined) || "0x", // Default to "0x" if undefined
      value: transactionValue,
    };

    console.log("Submitting transaction to bridge:", {
      to: transactionToSubmit.to,
      dataLength: transactionToSubmit.data ? transactionToSubmit.data.length : 0,
      value: transactionValue.toString(),
      payProtocolFee: args.payProtocolFee,
    });

    try {
      const txResponse = await sendTransaction(wallet, transactionToSubmit);

      if (!txResponse.success) {
        console.error("Bridge transaction failed details:", txResponse.error);
        let errorMessage = typeof txResponse.error === "string" ? txResponse.error : JSON.stringify(txResponse.error);
        
        if (errorMessage.includes("execution reverted") || errorMessage.includes("missing response")) {
          errorMessage += `\n\nThis may be due to one of the following issues:
1. Insufficient token allowance for the deBridge contract to spend ${args.tokenInAddress}.
2. Insufficient NATIVE currency balance in the smart account to cover the deBridge protocol fee (if payProtocolFee is true). Current fee: ${nativeFeeAmount > 0n ? formatBigIntToEth(nativeFeeAmount) + " native currency." : "(not detected or set to 0)."}
3. Insufficient underlying ${srcChainTokenIn?.symbol || args.tokenInAddress} balance.
4. Issues with the paymaster or bundler (e.g., account not funded with paymaster, or network congestion).
5. If a pre-swap to a reserve asset was involved, there might have been issues with that internal swap.`;
        }
        
        return `Bridge transaction failed: ${errorMessage}`;
      }

      // 7. Return Result
      const inputAmountHuman = args.amount;
      const inputSymbol = srcChainTokenIn?.symbol || args.tokenInAddress;
      const outputAmountHuman = dstChainTokenOut?.amount || "Unknown";
      const outputSymbol = dstChainTokenOut?.symbol || args.tokenOutAddress;
      const slippageValue = recommendedSlippage || args.slippage;

      let resultMessage = `Bridge transaction submitted successfully!
Source Tx Hash: ${txResponse.txHash}
Sending: ${inputAmountHuman} ${inputSymbol} (from chain ${args.fromChainId})
Est. Receiving: ${outputAmountHuman} ${outputSymbol} (on chain ${args.toChainId})
Recipient: ${recipient}
Slippage: ${slippageValue}%`;

      if (protocolFeeInfo) {
        if (args.payProtocolFee && nativeFeeAmount > 0n) {
          resultMessage += `\n${protocolFeeInfo} (included in transaction)`;
        } else if (nativeFeeAmount > 0n) {
          resultMessage += `\n${protocolFeeInfo} (detected, but EXCLUDED from transaction as payProtocolFee is false)`;
        }
      }

      resultMessage += `\nNote: Actual received amount may vary. Check the order status via Debridge for updates.`;
      
      return resultMessage;
    } catch (error) {
      console.error("Error during bridge transaction submission:", error);
      return `Error during bridge transaction submission: ${error instanceof Error ? error.message : String(error)}`;
    }
  } catch (error) {
    console.error("Smart Bridge Error:", error);
    return `An unexpected error occurred during the bridge operation: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Helper function to format BigInt wei values to ETH with appropriate decimal places
function formatBigIntToEth(wei: bigint): string {
  const etherValue = Number(wei) / 1e18;
  // Show more precision for very small ETH values, less for larger ones.
  if (etherValue === 0) return "0";
  const precision = etherValue < 0.0001 ? 8 : (etherValue < 0.01 ? 6 : 4);
  return etherValue.toFixed(precision);
}

export class SmartBridgeAction implements AgentkitAction<typeof SmartBridgeInput> {
  public name = "smart_bridge";
  public description = BRIDGE_PROMPT;
  public argsSchema = SmartBridgeInput;
  public func = smartBridge;
  public smartAccountRequired = true; // Requires a smart account for gasless and approvals
}
