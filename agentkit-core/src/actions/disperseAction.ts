import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseEther, parseUnits } from "viem";
import { TokenABI } from "../constants";
import { sendTransaction } from "../services";
import { AgentkitAction } from "../agentkit";

const DISPERSE_PROMPT = `
This tool enables gasless batch transfers of tokens or native currency to multiple recipients in a single operation.

It takes the following inputs:
- recipients: An array of recipient objects, each containing an address and amount
- tokenAddress: The token contract address (use 'eth' for native currency transfers)

Benefits:
- Save time: Send to multiple addresses at once
- Gasless: All transactions are sponsored by 0xGasless paymaster
- Efficient: Reduces the need for multiple individual transactions

Important notes:
- All recipients will receive the same token type (either ETH or the specified ERC20 token)
- Each recipient can receive a different amount
- Maximum 50 recipients per batch for optimal performance
- Available on supported networks: Avalanche C-Chain, Sonic chain, BASE, BNB chain, Moonbeam, Avalanche Fuji
- The transaction will be submitted and confirmed automatically

Example usage:
- Send different amounts of USDC to multiple team members
- Distribute native ETH to multiple wallets
- Batch payments to contractors or contributors
`;

/**
 * Input schema for batch transfer action.
 */
export const DisperseInput = z
  .object({
    recipients: z
      .array(
        z.object({
          address: z.string().describe("The recipient wallet address"),
          amount: z.string().describe("The amount to send to this recipient"),
        }),
      )
      .min(1, "At least one recipient is required")
      .max(50, "Maximum 50 recipients allowed per batch")
      .describe("Array of recipients with their addresses and amounts"),
    tokenAddress: z
      .string()
      .describe("The token contract address or 'eth' for native currency transfers"),
  })
  .strip()
  .describe("Instructions for batch transferring tokens to multiple recipients");

/**
 * Validates recipient addresses and amounts
 */
function validateRecipients(recipients: Array<{ address: string; amount: string }>): string | null {
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.address)) {
      return `Invalid address format for recipient ${i + 1}: ${recipient.address}`;
    }

    // Validate amount is positive number
    const amount = parseFloat(recipient.amount);
    if (isNaN(amount) || amount <= 0) {
      return `Invalid amount for recipient ${i + 1}: ${recipient.amount}. Amount must be a positive number.`;
    }
  }

  return null;
}

/**
 * Creates individual transfer transactions for each recipient
 */
async function createTransferTransactions(
  wallet: ZeroXgaslessSmartAccount,
  recipients: Array<{ address: string; amount: string }>,
  tokenAddress: string,
  isEth: boolean,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  if (isEth) {
    // Native ETH transfers
    for (const recipient of recipients) {
      transactions.push({
        to: recipient.address as `0x${string}`,
        data: "0x",
        value: parseEther(recipient.amount),
      });
    }
  } else {
    // ERC20 token transfers
    const decimals = await wallet.rpcProvider.readContract({
      abi: TokenABI,
      address: tokenAddress as `0x${string}`,
      functionName: "decimals",
    });

    for (const recipient of recipients) {
      const data = encodeFunctionData({
        abi: TokenABI,
        functionName: "transfer",
        args: [
          recipient.address as `0x${string}`,
          parseUnits(recipient.amount, (decimals as number) || 18),
        ],
      });

      transactions.push({
        to: tokenAddress as `0x${string}`,
        data,
        value: 0n,
      });
    }
  }

  return transactions;
}

/**
 * Executes batch transfers to multiple recipients using gasless transactions.
 *
 * @param wallet - The smart account to transfer from.
 * @param args - The input arguments for the action.
 * @returns A message containing the batch transfer details.
 */
export async function disperseTokens(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DisperseInput>,
): Promise<string> {
  try {
    // Validate inputs
    const validationError = validateRecipients(args.recipients);
    if (validationError) {
      return `Validation error: ${validationError}`;
    }

    const isEth = args.tokenAddress.toLowerCase() === "eth";
    const tokenType = isEth ? "ETH" : `tokens from contract ${args.tokenAddress}`;

    // Calculate total amount for summary
    const totalAmount = args.recipients.reduce((sum, recipient) => {
      return sum + parseFloat(recipient.amount);
    }, 0);

    // Create transfer transactions
    const transactions = await createTransferTransactions(
      wallet,
      args.recipients,
      args.tokenAddress,
      isEth,
    );

    // Execute all transactions
    const results: string[] = [];
    const successfulTransfers: Array<{ address: string; amount: string; txHash?: string }> = [];
    const failedTransfers: Array<{ address: string; amount: string; error: string }> = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const recipient = args.recipients[i];

      try {
        const response = await sendTransaction(wallet, tx);

        if (response && response.success) {
          successfulTransfers.push({
            address: recipient.address,
            amount: recipient.amount,
            txHash: response.txHash,
          });
          results.push(
            `✅ ${recipient.address}: ${recipient.amount} ${isEth ? "ETH" : "tokens"} - ${response.txHash}`,
          );
        } else {
          const errorMessage =
            typeof response?.error === "string"
              ? response.error
              : response?.error?.message || "Unknown error";
          failedTransfers.push({
            address: recipient.address,
            amount: recipient.amount,
            error: errorMessage,
          });
          results.push(
            `❌ ${recipient.address}: ${recipient.amount} ${isEth ? "ETH" : "tokens"} - FAILED: ${errorMessage}`,
          );
        }
      } catch (error) {
        failedTransfers.push({
          address: recipient.address,
          amount: recipient.amount,
          error: String(error),
        });
        results.push(
          `❌ ${recipient.address}: ${recipient.amount} ${isEth ? "ETH" : "tokens"} - FAILED: ${error}`,
        );
      }
    }

    // Generate comprehensive summary
    const summary = [
      `🚀 Gasless Batch Transfer Completed!`,
      ``,
      `📊 Summary:`,
      `• Total Recipients: ${args.recipients.length}`,
      `• Successful Transfers: ${successfulTransfers.length}`,
      `• Failed Transfers: ${failedTransfers.length}`,
      `• Total Amount Distributed: ${totalAmount} ${isEth ? "ETH" : "tokens"}`,
      `• Token Type: ${tokenType}`,
      ``,
      `📝 Transfer Details:`,
      ...results,
    ];

    if (failedTransfers.length > 0) {
      summary.push(
        ``,
        `⚠️ Note: ${failedTransfers.length} transfer(s) failed. Please check recipient addresses and account balances.`,
      );
    }

    return summary.join("\n");
  } catch (error) {
    return `Error executing batch transfer: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Disperse tokens action for gasless batch transfers.
 */
export class DisperseAction implements AgentkitAction<typeof DisperseInput> {
  public name = "disperse_tokens";
  public description = DISPERSE_PROMPT;
  public argsSchema = DisperseInput;
  public func = disperseTokens;
  public smartAccountRequired = true;
}
