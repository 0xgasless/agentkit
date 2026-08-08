import { z } from "zod";
import { ZeroXgaslessSmartAccount, UserOpReceipt } from "@0xgasless/smart-account-sdk";
import { AgentkitAction } from "../agentkit"; // Adjust path if necessary

// Constants for polling logic (can be adjusted)
const DEFAULT_WAIT_INTERVAL = 5000; // 5 seconds
const DEFAULT_MAX_DURATION = 60000; // 60 seconds

// 1. Define the schema for the input parameters
export const GetTransactionStatusSchema = z.object({
  userOpHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid User Operation Hash format."),
});

// Infer the type from the schema
type GetTransactionStatusInput = z.infer<typeof GetTransactionStatusSchema>;

// 2. Define the prompt detailing the tool's use
export const GetTransactionStatusPrompt = `
Name: get_transaction_status
Description: Checks the status of a submitted User Operation (transaction) using its hash. It polls the bundler until the transaction is confirmed or a timeout is reached.
Usage: Use this action after 'send_transaction' to determine if the transaction was successfully included in a block. Provide the 'userOpHash' returned by 'send_transaction'.
Input Parameters:
  - userOpHash (string, required): The User Operation hash (0x...) obtained after submitting a transaction.
Output:
  - If confirmed: Returns a confirmation message including the transaction hash and block number. Example: "Transaction confirmed! TxHash: 0x..., Block: 123456"
  - If still pending after timeout: Returns a message indicating it's still pending. Example: "Transaction is still pending after 60 seconds. UserOpHash: 0x..."
  - If failed: Returns an error message indicating the failure. Example: "Error: Transaction failed or was not found. UserOpHash: 0x..."
  - On error: Returns a detailed error message. Example: "Error: Failed to get transaction status: Bundler URL not configured."
`;

// 3. Define the core function logic - requires wallet for bundler access
export async function getTransactionStatusFunc(
  wallet: ZeroXgaslessSmartAccount, // Wallet instance is passed first
  { userOpHash }: GetTransactionStatusInput,
): Promise<string> {
  if (!wallet.bundler) {
    return "Error: Failed to get transaction status: Bundler not configured on the smart account.";
  }

  let totalDuration = 0;

  // Re-implement polling using the SDK's getUserOperationReceipt
  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      try {
        const receipt: UserOpReceipt | null = await wallet.bundler!.getUserOpReceipt(userOpHash);

        // Check if the receipt exists and indicates success
        if (receipt?.success) {
          const txHash = receipt.receipt?.transactionHash;
          const blockNumber = receipt.receipt?.blockNumber;
          if (txHash && blockNumber) {
            clearInterval(intervalId);
            resolve(
              `Transaction confirmed! TxHash: ${txHash}, Block: ${Number(blockNumber)}. UserOpHash: ${userOpHash}`,
            );
            return;
          } else {
            // Still technically success, but maybe log a warning if details missing?
            clearInterval(intervalId);
            resolve(
              `Transaction succeeded but receipt details (TxHash, Block) missing. UserOpHash: ${userOpHash}`,
            );
            return;
          }
        } else if (receipt && !receipt.success) {
          // Transaction included but failed
          clearInterval(intervalId);
          resolve(
            `Transaction failed. UserOpHash: ${userOpHash}. Reason: ${receipt.reason || "No reason provided"}.`,
          );
          return;
        }
        // If receipt is null, it's still pending

        // Update duration and check timeout
        totalDuration += DEFAULT_WAIT_INTERVAL;
        if (totalDuration >= DEFAULT_MAX_DURATION) {
          clearInterval(intervalId);
          resolve(
            `Transaction is still pending after ${DEFAULT_MAX_DURATION / 1000} seconds. UserOpHash: ${userOpHash}`,
          );
          return;
        }
      } catch (error: unknown) {
        console.error("Error polling transaction status:", error);
        clearInterval(intervalId);
        resolve(
          `Error polling transaction status for ${userOpHash}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return; // Exit promise on error
      }
    }, DEFAULT_WAIT_INTERVAL);
  });
}

// 4. Define the AgentkitAction class
export class GetTransactionStatusAction
  implements AgentkitAction<typeof GetTransactionStatusSchema>
{
  public name = "get_transaction_status";
  public description = GetTransactionStatusPrompt;
  public argsSchema = GetTransactionStatusSchema;
  public func = getTransactionStatusFunc;
  public smartAccountRequired = true; // Requires wallet to get bundler URL
}
