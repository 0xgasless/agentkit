import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseEther, parseUnits } from "viem";
import { TokenABI } from "../constants";
import { sendTransaction } from "../services";
import { AgentkitAction } from "../agentkit";

const SMART_TRANSFER_PROMPT = `
This tool will transfer an ERC20 token or native currency from the wallet to another onchain address using gasless transactions.

It takes the following inputs:
- amount: The amount to transfer
- tokenAddress: The token contract address (use 'eth' for native currency transfers)
- destination: Where to send the funds (must be a valid onchain address)

Important notes:
- Gasless transfers are only available on supported networks: Avalanche C-Chain, Sonic chain, BASE, BNB chain, Moonbeam, Avalanche Fuji.
- The transaction will be submitted and the tool will wait for confirmation by default.
`;

/**
 * Input schema for smart transfer action.
 */
export const SmartTransferInput = z
  .object({
    amount: z.string().describe("The amount of tokens to transfer"),
    tokenAddress: z
      .string()
      .describe("The token contract address or 'eth' for native currency transfers"),
    destination: z.string().describe("The recipient address"),
  })
  .strip()
  .describe("Instructions for transferring tokens from a smart account to an onchain address");

/**
 * Transfers assets using gasless transactions.
 *
 * @param wallet - The smart account to transfer from.
 * @param args - The input arguments for the action.
 * @returns A message containing the transfer details.
 */
export async function smartTransfer(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartTransferInput>,
): Promise<string> {
  try {
    const isEth = args.tokenAddress.toLowerCase() === "eth";
    let tx: Transaction;

    if (isEth) {
      // Native ETH transfer
      tx = {
        to: args.destination as `0x${string}`,
        data: "0x",
        value: parseEther(args.amount),
      };
    } else {
      // ERC20 token transfer
      const decimals = await wallet.rpcProvider.readContract({
        abi: TokenABI,
        address: args.tokenAddress as `0x${string}`,
        functionName: "decimals",
      });
      const data = encodeFunctionData({
        abi: TokenABI,
        functionName: "transfer",
        args: [
          args.destination as `0x${string}`,
          parseUnits(args.amount, (decimals as number) || 18),
        ],
      });

      tx = {
        to: args.tokenAddress as `0x${string}`,
        data,
        value: 0n,
      };
    }

    const response = await sendTransaction(wallet, tx);

    if (!response || !response.success) {
      return `Transaction failed: ${response?.error || "Unknown error"}`;
    }

    return `The transaction has been confirmed on the blockchain. Successfully transferred ${args.amount} ${
      isEth ? "ETH" : `tokens from contract ${args.tokenAddress}`
    } to ${args.destination}. Transaction Hash: ${response.txHash}`;
  } catch (error) {
    return `Error transferring the asset: ${error}`;
  }
}

/**
 * Smart transfer action.
 */
export class SmartTransferAction implements AgentkitAction<typeof SmartTransferInput> {
  public name = "smart_transfer";
  public description = SMART_TRANSFER_PROMPT;
  public argsSchema = SmartTransferInput;
  public func = smartTransfer;
  public smartAccountRequired = true;
}
