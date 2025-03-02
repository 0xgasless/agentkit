import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../agentkit";
import { waitForTransaction } from "../services";

const CHECK_TRANSACTION_PROMPT = `
This tool checks the status of a previously submitted transaction using its User Operation Hash.
It will attempt to get the transaction receipt and confirmation status.

Required parameters:
- userOpHash: The User Operation Hash returned when the transaction was submitted
- confirmations: (Optional) Number of block confirmations to wait for (default: 1)
- maxDuration: (Optional) Maximum time to wait in milliseconds (default: 30000)
- interval: (Optional) How often to check status in milliseconds (default: 5000)
`;

export const CheckTransactionInput = z
  .object({
    userOpHash: z.string().describe("The User Operation Hash to check"),
    confirmations: z
      .number()
      .optional()
      .describe("Number of block confirmations to wait for (default: 1)"),
    maxDuration: z
      .number()
      .optional()
      .describe("Maximum time to wait in milliseconds (default: 30000)"),
    interval: z
      .number()
      .optional()
      .describe("How often to check status in milliseconds (default: 5000)"),
  })
  .strip()
  .describe("Instructions for checking transaction status");

/**
 * Checks the status of a transaction using its User Operation Hash.
 *
 * @param wallet - The smart account to use for checking status.
 * @param args - The input arguments containing the userOpHash and optional parameters.
 * @returns A message containing the transaction status.
 */
export async function checkTransactionStatus(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CheckTransactionInput>,
): Promise<string> {
  try {
    const status = await waitForTransaction(wallet, args.userOpHash, {
      confirmations: args.confirmations,
      maxDuration: args.maxDuration,
      interval: args.interval,
    });

    switch (status.status) {
      case "confirmed":
        return `
Transaction confirmed!
Block Number: ${status.blockNumber}
Block Confirmations: ${status.blockConfirmations}
Receipt: ${JSON.stringify(status.receipt, null, 2)}
        `;

      case "pending":
        return `
Transaction is still pending.
${status.error ? `Note: ${status.error}` : ""}
You can try checking again with a longer maxDuration.
        `;

      case "failed":
        return `
Transaction failed!
Error: ${status.error}
        `;

      default:
        return `Unknown transaction status`;
    }
  } catch (error) {
    return `Error checking transaction status: ${error}`;
  }
}

/**
 * Check transaction status action.
 */
export class CheckTransactionAction implements AgentkitAction<typeof CheckTransactionInput> {
  public name = "check_transaction_status";
  public description = CHECK_TRANSACTION_PROMPT;
  public argsSchema = CheckTransactionInput;
  public func = checkTransactionStatus;
  public smartAccountRequired = true;
}
