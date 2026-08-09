import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account-sdk";
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
- Gasless transfers are only available on supported networks: Avalanche C-Chain, Avalanche Fuji, BASE, Sonic chain, BNB chain.
- The transaction will be submitted and the tool will wait for confirmation by default.
- In platform mode (KMS-custodied wallet), transfers support the stablecoins USDC and XSGD — pass the symbol or token address; amount is in human units (e.g. "1.5" = 1.5 USDC). Settled gaslessly by the 0xGasless facilitator under the agent's spending policy.
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

/** Known platform-payable tokens: symbol or address (any chain) → symbol. */
const PLATFORM_TOKENS: Record<string, "USDC" | "XSGD"> = {
  usdc: "USDC",
  xsgd: "XSGD",
  // USDC contracts (avalanche / fuji / base)
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "USDC",
  "0x5425890298aed601595a70ab815c96711a31bc65": "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  // XSGD contracts (avalanche / fuji)
  "0xb2f85b7ab3c2b6f62df06de6ae7d09c010a5096e": "XSGD",
  "0xd769410dc8772695a7f55a304d2125320a65c2a5": "XSGD",
};

/**
 * Platform-mode transfer: stablecoin transfers become x402 payments signed by
 * the agent's KMS wallet and settled gaslessly by the 0xGasless facilitator,
 * with server-side spending policy enforced.
 */
export async function smartTransferPlatform(
  // biome-ignore lint/suspicious/noExplicitAny: OxGasAgent type comes from @0xgasless/agent
  client: any,
  agentId: string,
  args: z.infer<typeof SmartTransferInput>,
): Promise<string> {
  const tokenSymbol = PLATFORM_TOKENS[args.tokenAddress.toLowerCase()];
  if (!tokenSymbol) {
    return (
      `Platform-mode transfers support USDC and XSGD (pass the symbol or a known ` +
      `token address). '${args.tokenAddress}' is not supported — for other tokens ` +
      `use self-custody mode.`
    );
  }
  try {
    const value = parseUnits(args.amount, 6).toString(); // USDC/XSGD are 6-decimals
    const result = await client.x402.pay({ agentId, to: args.destination, value, tokenSymbol });
    const tx = result.settle?.transaction;
    return (
      `Successfully transferred ${args.amount} ${tokenSymbol} to ${args.destination}. ` +
      `Settled gaslessly by the 0xGasless facilitator. Transaction Hash: ${tx ?? "(pending)"}`
    );
  } catch (error) {
    return `Error transferring the asset: ${error instanceof Error ? error.message : String(error)}`;
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
  public platformFunc = smartTransferPlatform;
  public smartAccountRequired = true;
}
