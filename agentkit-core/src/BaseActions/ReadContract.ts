import { z } from "zod";
import { Abi, Address, isAddress } from "viem";
import { AgentkitAction } from "../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

// Helper to validate JSON strings (reuse if defined globally, or define here)
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

// Common error handling function (reuse if defined globally, or define here)
function formatError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error in ${toolName}:`, error);
  return `Error in ${toolName}: ${message}`;
}

// 1. Define the schema for the input parameters
export const ReadContractSchema = z.object({
  contractAddress: z.string().refine(isAddress, "Invalid contract address format."),
  abiString: jsonString.describe(
    "The contract ABI fragment (or full ABI) as a JSON string array, containing the function to read.",
  ),
  functionName: z.string().describe("The name of the view or pure function to call."),
  argsString: jsonString
    .describe(
      "The arguments for the function as a JSON string array. Omit or use '[]' for functions with no arguments.",
    )
    .optional()
    .nullable(),
});

// Infer the type from the schema
type ReadContractInput = z.infer<typeof ReadContractSchema>;

// 2. Define the prompt detailing the tool's use
export const ReadContractPrompt = `
Name: read_contract
Description: Reads data from a specified function on a smart contract without sending a transaction (gasless view/pure call).
Usage: Use this to fetch information stored on a contract, such as balances, owner addresses, configuration settings, token URIs, etc. Only works for functions that do not modify state (marked as 'view' or 'pure' in the ABI).
Input Parameters:
  - contractAddress (string, required): The address of the contract to read from.
  - abiString (string, required): A JSON string representation of the contract's ABI, or at least the fragment defining the function you want to call. Example: '[{"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"stateMutability":"view","type":"function"}]'
  - functionName (string, required): The exact name of the 'view' or 'pure' function to call. Example: "symbol"
  - argsString (string, optional): The arguments for the function, provided as a JSON string array. Order and types must match the ABI. Example: '["0xSomeAddress"]' or '[]' if no arguments.
Output:
  - On success: Returns the result read from the contract, converted to a string. Complex results (structs, arrays) will be JSON stringified. Example: "Result: USDC" or "Result: 1000000000000000000" or "Result: [\\"value1\\", \\"value2\\"]"
  - On failure: Returns an error message detailing the issue. Example: "Error: read_contract: Function 'getOwner' not found on ABI." or "Error: read_contract: Invalid contract address."
`;

// 3. Define the core function logic - requires wallet for RPC provider
export async function readContractFunc(
  wallet: ZeroXgaslessSmartAccount, // Wallet instance is passed first
  { contractAddress, abiString, functionName, argsString }: ReadContractInput,
): Promise<string> {
  try {
    // Ensure the RPC provider is available
    const rpcProvider = wallet.rpcProvider;
    if (!rpcProvider) {
      return formatError("read_contract", "RPC Provider not found on the wallet instance.");
    }

    // Parse ABI and arguments
    const abi = JSON.parse(abiString) as Abi;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const args = argsString ? (JSON.parse(argsString) as any[]) : [];

    // Perform the read operation
    const result = await rpcProvider.readContract({
      address: contractAddress as Address, // Cast after validation
      abi: abi,
      functionName: functionName,
      args: args,
    });

    // Format the result as a string for the agent
    let resultString: string;
    if (typeof result === "bigint") {
      resultString = result.toString();
    } else if (typeof result === "object" && result !== null) {
      // Attempt to stringify complex objects/arrays, handle BigInts within
      resultString = JSON.stringify(result, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      );
    } else {
      // Handle primitives (string, number, boolean, null, undefined)
      resultString = String(result);
    }

    return `Result: ${resultString}`;
  } catch (error: unknown) {
    return formatError("read_contract", error);
  }
}

// 4. Define the AgentkitAction class
export class ReadContractAction implements AgentkitAction<typeof ReadContractSchema> {
  public name = "read_contract";
  public description = ReadContractPrompt;
  public argsSchema = ReadContractSchema;
  public func = readContractFunc;
  public smartAccountRequired = true; // Requires wallet for the RPC Provider
}
