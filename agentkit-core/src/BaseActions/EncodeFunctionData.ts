import { z } from "zod";
import { encodeFunctionData, Abi, AbiFunctionNotFoundError } from "viem";
import { AgentkitAction } from "../agentkit"; // Adjust path if necessary
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

// Helper to validate JSON strings
const jsonString = z.string().refine(
  data => {
    try {
      JSON.parse(data);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid JSON string" },
);

// 1. Define the schema for the input parameters
export const EncodeFunctionDataSchema = z.object({
  abiString: jsonString.describe("The contract ABI as a JSON string array."),
  functionName: z.string().describe("The name of the function to encode."),
  argsString: jsonString
    .describe("The arguments for the function as a JSON string array.")
    .optional()
    .nullable(),
});

// Infer the type from the schema
type EncodeFunctionDataInput = z.infer<typeof EncodeFunctionDataSchema>;

// 2. Define the prompt detailing the tool's use
export const EncodeFunctionDataPrompt = `
Name: encode_function_data
Description: Encodes a contract function call into hexadecimal data (calldata) using the provided ABI, function name, and arguments. This is necessary for sending transactions that interact with smart contracts.
Usage: Use this tool to prepare the 'data' field for the 'send_transaction' action when you need to call a specific function on a smart contract.
Input Parameters:
  - abiString (string, required): The contract Application Binary Interface (ABI) as a JSON formatted string. Example: '[{"inputs":[{"name":"to","type":"address"},{"name":"value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]'
  - functionName (string, required): The exact name of the function you want to call, as defined in the ABI. Example: "transfer"
  - argsString (string, optional): The arguments required by the function, provided as a JSON formatted string array. The order and types must match the function signature in the ABI. Example: '["0xRecipientAddress", "1000000000000000000"]' (for address and uint256). If the function takes no arguments, omit this parameter or provide an empty array '[]'.
Output:
  - On success: Returns the encoded calldata as a hexadecimal string (0x...). Example: "Encoded Data: 0xa9059cbb000000000000000000000000recipientaddress000000000000000000000000000000000000000000000de0b6b3a7640000"
  - On failure: Returns an error message detailing the issue. Example: "Error: Failed to encode function data: Function 'transferr' not found on ABI."
`;

// 3. Define the core function logic - NO wallet needed
export async function encodeFunctionDataFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { abiString, functionName, argsString }: EncodeFunctionDataInput,
): Promise<string> {
  try {
    // Parse the ABI string into an Abi object
    const abi = JSON.parse(abiString) as Abi;

    // Parse the args string into an array, or use an empty array if not provided
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const args = argsString ? (JSON.parse(argsString) as any[]) : [];

    // Encode the function data using viem
    const data = encodeFunctionData({
      abi: abi,
      functionName: functionName,
      args: args,
    });

    // Return the encoded data
    return `Encoded Data: ${data}`;
  } catch (error: unknown) {
    console.error("Error in encodeFunctionDataFunc:", error);
    let errorMessage = "Failed to encode function data";
    if (error instanceof AbiFunctionNotFoundError) {
      errorMessage = `Error: ${errorMessage}: Function '${error.message}' not found on ABI. Check spelling and ABI correctness.`;
    } else if (error instanceof Error) {
      errorMessage = `Error: ${errorMessage}: ${error.message}`;
    } else {
      errorMessage = `Error: ${errorMessage}: ${String(error)}`;
    }
    // Handle potential JSON parsing errors or encoding errors from viem
    return errorMessage;
  }
}

// 4. Define the AgentkitAction class
export class EncodeFunctionDataAction implements AgentkitAction<typeof EncodeFunctionDataSchema> {
  public name = "encode_function_data";
  public description = EncodeFunctionDataPrompt;
  public argsSchema = EncodeFunctionDataSchema;
  public func = encodeFunctionDataFunc;
  public smartAccountRequired = false; // This action does not require a wallet
}

// Optionally export the individual components if needed elsewhere
// export { EncodeFunctionDataSchema, EncodeFunctionDataPrompt, encodeFunctionDataFunc };
