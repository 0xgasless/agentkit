import { z } from "zod";
import {
  formatUnits,
  parseUnits,
  formatEther,
  parseEther,
  toHex,
  fromHex,
  toBytes,
  fromBytes,
  bytesToString,
  stringToBytes,
  bytesToHex,
  hexToBytes,
  Hex,
  isHex,
} from "viem";
import { AgentkitAction } from "../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";

// Common error handling function
function formatError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error in ${toolName}:`, error);
  return `Error in ${toolName}: ${message}`;
}

// --- 1. Format Units ---

export const FormatUnitsSchema = z.object({
  value: z.string().regex(/^-?\d+$/, "Value must be a string representing an integer (wei)."),
  decimals: z.number().int().positive("Decimals must be a positive integer."),
});
type FormatUnitsInput = z.infer<typeof FormatUnitsSchema>;
export const FormatUnitsPrompt = `
Name: format_units
Description: Converts a numerical value (as a string in wei or smallest unit) into a human-readable string representation based on the specified number of decimals.
Usage: Useful for displaying token balances or amounts stored as large integers in a user-friendly format (e.g., converting wei to Ether, or smallest token unit to standard unit).
Input Parameters:
  - value (string, required): The numerical value in its smallest unit (e.g., wei) as a string.
  - decimals (number, required): The number of decimal places the unit uses (e.g., 18 for Ether, 6 for USDC).
Output:
  - On success: Returns the formatted string. Example: "1.2345"
  - On failure: Returns an error message.
`;
export async function formatUnitsFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value, decimals }: FormatUnitsInput,
): Promise<string> {
  try {
    const formatted = formatUnits(BigInt(value), decimals);
    return `Formatted Value: ${formatted}`;
  } catch (error: unknown) {
    return formatError("format_units", error);
  }
}
export class FormatUnitsAction implements AgentkitAction<typeof FormatUnitsSchema> {
  public name = "format_units";
  public description = FormatUnitsPrompt;
  public argsSchema = FormatUnitsSchema;
  public func = formatUnitsFunc;
  public smartAccountRequired = false;
}

// --- 2. Parse Units ---

export const ParseUnitsSchema = z.object({
  value: z
    .string()
    .regex(/^-?(\d+(\.\d+)?|\.\d+)$/, "Value must be a string representing a decimal number."),
  decimals: z.number().int().positive("Decimals must be a positive integer."),
});
type ParseUnitsInput = z.infer<typeof ParseUnitsSchema>;
export const ParseUnitsPrompt = `
Name: parse_units
Description: Converts a human-readable string representation of a value (e.g., "1.23") into its integer representation (e.g., wei) based on the specified number of decimals.
Usage: Useful for converting user input (like "0.5" ETH) into the format required for blockchain transactions (wei).
Input Parameters:
  - value (string, required): The human-readable decimal value as a string.
  - decimals (number, required): The number of decimal places the unit uses (e.g., 18 for Ether, 6 for USDC).
Output:
  - On success: Returns the parsed value as a string integer. Example: "1230000000000000000"
  - On failure: Returns an error message.
`;
export async function parseUnitsFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value, decimals }: ParseUnitsInput,
): Promise<string> {
  try {
    const parsed = parseUnits(value, decimals);
    return `Parsed Value (Wei): ${parsed.toString()}`;
  } catch (error: unknown) {
    return formatError("parse_units", error);
  }
}
export class ParseUnitsAction implements AgentkitAction<typeof ParseUnitsSchema> {
  public name = "parse_units";
  public description = ParseUnitsPrompt;
  public argsSchema = ParseUnitsSchema;
  public func = parseUnitsFunc;
  public smartAccountRequired = false;
}

// --- 3. Format Ether ---

export const FormatEtherSchema = z.object({
  value: z.string().regex(/^-?\d+$/, "Value must be a string representing an integer (wei)."),
});
type FormatEtherInput = z.infer<typeof FormatEtherSchema>;
export const FormatEtherPrompt = `
Name: format_ether
Description: Converts a value in wei (as a string) into its Ether representation (string). Shortcut for format_units with decimals=18.
Usage: Specifically for converting native currency wei values to Ether.
Input Parameters:
  - value (string, required): The value in wei as a string.
Output:
  - On success: Returns the formatted Ether string. Example: "1.2345"
  - On failure: Returns an error message.
`;
export async function formatEtherFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value }: FormatEtherInput,
): Promise<string> {
  try {
    const formatted = formatEther(BigInt(value));
    return `Formatted Ether: ${formatted}`;
  } catch (error: unknown) {
    return formatError("format_ether", error);
  }
}
export class FormatEtherAction implements AgentkitAction<typeof FormatEtherSchema> {
  public name = "format_ether";
  public description = FormatEtherPrompt;
  public argsSchema = FormatEtherSchema;
  public func = formatEtherFunc;
  public smartAccountRequired = false;
}

// --- 4. Parse Ether ---

export const ParseEtherSchema = z.object({
  value: z
    .string()
    .regex(/^-?(\d+(\.\d+)?|\.\d+)$/, "Value must be a string representing a decimal number."),
});
type ParseEtherInput = z.infer<typeof ParseEtherSchema>;
export const ParseEtherPrompt = `
Name: parse_ether
Description: Converts a string representation of Ether into its wei representation (as a string). Shortcut for parse_units with decimals=18.
Usage: Specifically for converting Ether values (like user input) to wei for transactions.
Input Parameters:
  - value (string, required): The Ether value as a string.
Output:
  - On success: Returns the parsed value in wei as a string. Example: "1234500000000000000"
  - On failure: Returns an error message.
`;
export async function parseEtherFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value }: ParseEtherInput,
): Promise<string> {
  try {
    const parsed = parseEther(value);
    return `Parsed Wei: ${parsed.toString()}`;
  } catch (error: unknown) {
    return formatError("parse_ether", error);
  }
}
export class ParseEtherAction implements AgentkitAction<typeof ParseEtherSchema> {
  public name = "parse_ether";
  public description = ParseEtherPrompt;
  public argsSchema = ParseEtherSchema;
  public func = parseEtherFunc;
  public smartAccountRequired = false;
}

// --- 5. To Hex ---

export const ToHexSchema = z.object({
  value: z
    .union([
      z.string(),
      z.number(),
      z.bigint(),
      z.boolean(),
      // z.instanceof(Uint8Array) // Difficult to represent Uint8Array as string input reliably
    ])
    .describe("The value to convert to Hex. Can be string, number, bigint, or boolean."),
  // size: z.number().int().positive().optional().describe("The desired byte size of the hex value.")
});
type ToHexInput = z.infer<typeof ToHexSchema>;
export const ToHexPrompt = `
Name: to_hex
Description: Converts a string, number, bigint, or boolean value into a hexadecimal string (0x...).
Usage: Useful for converting various data types into the hex format commonly used in Ethereum. Note: Cannot directly convert byte arrays via agent input, use other tools first if needed.
Input Parameters:
  - value (string | number | bigint | boolean, required): The value to encode.
Output:
  - On success: Returns the hex string. Example: "Hex: 0x60" (for number 96)
  - On failure: Returns an error message.
`;
export async function toHexFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value }: ToHexInput,
): Promise<string> {
  try {
    // Explicitly handle boolean as viem might require number/bigint/string/bytes
    const valueToConvert = typeof value === "boolean" ? (value ? 1 : 0) : value;
    const hexValue = toHex(valueToConvert as string | number | bigint | Hex); // Cast needed after boolean check
    return `Hex: ${hexValue}`;
  } catch (error: unknown) {
    return formatError("to_hex", error);
  }
}
export class ToHexAction implements AgentkitAction<typeof ToHexSchema> {
  public name = "to_hex";
  public description = ToHexPrompt;
  public argsSchema = ToHexSchema;
  public func = toHexFunc;
  public smartAccountRequired = false;
}

// --- 6. From Hex ---

export const FromHexSchema = z.object({
  hex: z.string().refine(isHex, "Input must be a valid hex string (0x...)."),
  to: z
    .enum(["string", "number", "bigint", "boolean"])
    .describe("The target type to convert the hex value to."),
});
type FromHexInput = z.infer<typeof FromHexSchema>;
export const FromHexPrompt = `
Name: from_hex
Description: Converts a hexadecimal string (0x...) into a specified type (string, number, bigint, or boolean).
Usage: Useful for decoding hex values received from the blockchain or other sources.
Input Parameters:
  - hex (string, required): The hexadecimal string (must start with 0x).
  - to (string, required): The target type. Must be one of: "string", "number", "bigint", "boolean".
Output:
  - On success: Returns the decoded value. Example: "Decoded Value: 96" (for "0x60", "number")
  - On failure: Returns an error message.
`;
export async function fromHexFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { hex, to }: FromHexInput,
): Promise<string> {
  try {
    const value = fromHex(hex as Hex, to);
    return `Decoded Value: ${value.toString()}`; // Ensure output is stringifiable
  } catch (error: unknown) {
    return formatError("from_hex", error);
  }
}
export class FromHexAction implements AgentkitAction<typeof FromHexSchema> {
  public name = "from_hex";
  public description = FromHexPrompt;
  public argsSchema = FromHexSchema;
  public func = fromHexFunc;
  public smartAccountRequired = false;
}

// --- 7. To Bytes ---

export const ToBytesSchema = z.object({
  value: z
    .union([z.string(), z.number(), z.bigint()])
    .describe("The value (string, number, bigint) to convert to a byte array."),
  // opts: z.object({ size: z.number().int().positive().optional(), signed: z.boolean().optional() }).optional().describe("Optional settings for size and signedness.")
});
type ToBytesInput = z.infer<typeof ToBytesSchema>;
export const ToBytesPrompt = `
Name: to_bytes
Description: Converts a string (hex or UTF-8), number, or bigint into a Uint8Array byte representation. The output format is not directly usable by the agent but this tool confirms the conversion process. Primarily useful for internal checks or confirming data before encoding.
Usage: Use when needing to represent data as raw bytes, often as an intermediate step. Output is a description, not the raw bytes.
Input Parameters:
  - value (string | number | bigint, required): The value to convert. Strings are interpreted as hex if they start with 0x, otherwise UTF-8.
Output:
  - On success: Returns a confirmation message indicating the byte array was generated and its length. Example: "Value converted to byte array (Uint8Array) with length: 5"
  - On failure: Returns an error message.
`;
// This function won't return the actual Uint8Array to the agent, as it's not easily serializable/usable.
// It will return a confirmation string instead.
export async function toBytesFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { value }: ToBytesInput,
): Promise<string> {
  try {
    let bytes: Uint8Array;
    if (typeof value === "string") {
      bytes = stringToBytes(value); // handles hex and utf8 automatically via viem v2+
    } else {
      // For number/bigint, need more context (size, signed). For simplicity, using basic toHex -> hexToBytes
      const hexVal = toHex(value as number | bigint);
      bytes = hexToBytes(hexVal);
    }
    // const bytes = toBytes(value as string | number | bigint /*, opts */);
    return `Value converted to byte array (Uint8Array) with length: ${bytes.length}`;
  } catch (error: unknown) {
    return formatError("to_bytes", error);
  }
}

export class ToBytesAction implements AgentkitAction<typeof ToBytesSchema> {
  public name = "to_bytes";
  public description = ToBytesPrompt;
  public argsSchema = ToBytesSchema;
  public func = toBytesFunc;
  public smartAccountRequired = false;
}

// --- 8. From Bytes ---

export const FromBytesSchema = z.object({
  // Represent bytes as hex for agent input
  hexBytes: z
    .string()
    .refine(isHex, "Input must be a valid hex string representing bytes (0x...)."),
  to: z
    .enum(["string", "number", "bigint", "boolean"])
    .describe("The target type to convert the bytes to."),
  // opts: z.object({ size: z.number().int().positive().optional(), signed: z.boolean().optional() }).optional().describe("Optional settings for size and signedness for number/bigint conversion.")
});
type FromBytesInput = z.infer<typeof FromBytesSchema>;
export const FromBytesPrompt = `
Name: from_bytes
Description: Converts a byte array (represented as a hex string) into a specified type (string, number, bigint, or boolean).
Usage: Use when you have raw byte data (as hex) and need to interpret it as a specific data type.
Input Parameters:
  - hexBytes (string, required): The byte array represented as a hexadecimal string (0x...).
  - to (string, required): The target type. Must be one of: "string", "number", "bigint", "boolean".
Output:
  - On success: Returns the decoded value as a string. Example: "Decoded Value: HelloWorld" (for 'string') or "Decoded Value: 96" (for 'number')
  - On failure: Returns an error message.
`;
export async function fromBytesFunc(
  _wallet: ZeroXgaslessSmartAccount,
  { hexBytes, to /*, opts */ }: FromBytesInput,
): Promise<string> {
  try {
    const bytes = hexToBytes(hexBytes as Hex);
    let value: string | number | bigint | boolean;
    // viem's fromBytes is mainly for number/bigint with options.
    // For string, use bytesToString. For boolean, check if non-zero.
    switch (to) {
      case "string":
        value = bytesToString(bytes);
        break;
      case "number":
      case "bigint":
      case "boolean": {
        // Use fromHex for simplicity as it handles these conversions
        // Direct fromBytes requires size/signed options not easily managed here.
        const intermediateHex = bytesToHex(bytes);
        value = fromHex(intermediateHex, to); // Reuse fromHex logic
        break;
      }
      default: {
        return formatError("from_bytes", `Unsupported target type: ${to}`);
      }
    }

    //const value = fromBytes(bytes, { to: to as 'string' | 'number' | 'bigint' | 'boolean' /* , ...opts */ });
    return `Decoded Value: ${value.toString()}`;
  } catch (error: unknown) {
    return formatError("from_bytes", error);
  }
}
export class FromBytesAction implements AgentkitAction<typeof FromBytesSchema> {
  public name = "from_bytes";
  public description = FromBytesPrompt;
  public argsSchema = FromBytesSchema;
  public func = fromBytesFunc;
  public smartAccountRequired = false;
}

// --- Exports ---
// You might want to export these actions individually or as an array/object
export const formatHelperActions = [
  new FormatUnitsAction(),
  new ParseUnitsAction(),
  new FormatEtherAction(),
  new ParseEtherAction(),
  new ToHexAction(),
  new FromHexAction(),
  new ToBytesAction(),
  new FromBytesAction(),
];
