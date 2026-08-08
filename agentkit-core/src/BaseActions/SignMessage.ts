import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { AgentkitAction } from "../agentkit"; // Adjust path if necessary

// 1. Define the schema for the input parameters
export const SignMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty."),
});

// Infer the type from the schema
type SignMessageInput = z.infer<typeof SignMessageSchema>;

// 2. Define the prompt detailing the tool's use
export const SignMessagePrompt = `
Name: sign_message
Description: Signs an arbitrary message using the 0xgasless Smart Account's private key.
Usage: Use this action when an application or protocol requires you to prove ownership of your address by signing a specific message.
Input Parameters:
  - message (string, required): The message string that needs to be signed.
Output:
  - On success: Returns the signature as a hexadecimal string (0x...). Example: "Signature: 0x..."
  - On failure: Returns an error message detailing the issue. Example: "Error: Failed to sign message: User rejected signing."
`;

// 3. Define the core function logic
export async function signMessageFunc(
  wallet: ZeroXgaslessSmartAccount, // The wallet instance is passed implicitly
  { message }: SignMessageInput,
): Promise<string> {
  try {
    // Sign the message using the smart account's underlying signer
    const signature = await wallet.signMessage(message);

    // Return the signature
    return `Signature: ${signature}`;
  } catch (error: unknown) {
    // Catch any exceptions during the signing process
    console.error("Error in signMessageFunc:", error);
    return `Error: Failed to sign message: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// 4. Define the AgentkitAction class
export class SignMessageAction implements AgentkitAction<typeof SignMessageSchema> {
  public name = "sign_message";
  public description = SignMessagePrompt;
  public argsSchema = SignMessageSchema;
  public func = signMessageFunc;
  public smartAccountRequired = true; // Signing requires the smart account
}
