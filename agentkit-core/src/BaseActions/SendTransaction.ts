import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction, PaymasterMode } from "@0xgasless/smart-account";
import { AgentkitAction } from "../agentkit";

export const SendTransactionSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid 'to' address format."),
  data: z
    .string()
    .regex(/^0x[a-fA-F0-9]*$/, "Invalid 'data' hex format.")
    .optional()
    .nullable(),
  value: z
    .string()
    .regex(/^\d+$/, "Invalid 'value' format, should be a string of wei.")
    .optional()
    .nullable(),
});

// Infer the type from the schema
export type SendTransactionInput = z.infer<typeof SendTransactionSchema>;

// 2. Define the prompt detailing the tool's use
export const SendTransactionPrompt = `
Name: send_transaction
Description: Sends a transaction using the 0xgasless Smart Account. This action submits a transaction to the blockchain to interact with contracts or transfer native tokens.
Usage: Use this action when you need to execute a blockchain transaction, such as calling a contract function or sending the native currency (e.g., ETH, MATIC).
Input Parameters:
  - to (string, required): The destination address for the transaction (e.g., contract address or recipient EOA). Must be a valid Ethereum address (0x...).
  - data (string, optional): The encoded function data for contract interactions. Required when calling a contract function. Must be a hex string (0x...). Use 'encode_function_data' tool to generate this if needed.
  - value (string, optional): The amount of native currency (in wei) to send with the transaction. Defaults to "0" if not provided. Must be a string representing an integer.
Output:
  - On success: Returns a confirmation message including the User Operation Hash (userOpHash). Example: "Transaction submitted successfully! User Operation Hash: 0x..."
  - On failure: Returns an error message detailing the issue. Example: "Error: Failed to send transaction: Invalid 'to' address."

Note: This action only *submits* the transaction. Use the 'get_transaction_status' action with the returned userOpHash to check if the transaction has been confirmed on the blockchain.
`;

// 3. Define the core function logic
export async function sendTransactionFunc(
  wallet: ZeroXgaslessSmartAccount, // The wallet instance is passed implicitly by the agent runner
  { to, data, value }: SendTransactionInput,
): Promise<string> {
  try {
    // Construct the transaction object
    const tx: Transaction = {
      to: to as `0x${string}`, // Cast to expected type after validation
      data: data as `0x${string}` | undefined, // Cast to expected type after validation
      value: value ? BigInt(value) : BigInt(0), // Convert validated string to bigint
    };

    // Send the transaction using the 0xgasless SDK
    const request = await wallet.sendTransaction(tx, {
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED, // Use sponsored mode for gasless
      },
    });

    // Handle potential errors returned by the SDK
    if (request.error) {
      return `Error: Failed to send transaction: ${request.error.message || request.error}`;
    }

    // Return success message with the userOpHash
    return `Transaction submitted successfully! User Operation Hash: ${request.userOpHash}\nUse 'get_transaction_status' to check confirmation.`;
  } catch (error: unknown) {
    // Catch any other exceptions during the process
    console.error("Error in sendTransactionFunc:", error);
    return `Error: Failed to send transaction: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class SendTransactionAction implements AgentkitAction<typeof SendTransactionSchema> {
  public name = "send_transaction";
  public description = SendTransactionPrompt; // Use the prompt string
  public argsSchema = SendTransactionSchema; // Use the zod schema
  public func = sendTransactionFunc;
  public smartAccountRequired = true; // This action needs the smart account wallet
}
