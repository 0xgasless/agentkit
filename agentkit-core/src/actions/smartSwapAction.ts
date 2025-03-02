import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getContract } from "viem";
import { encodeFunctionData, parseUnits } from "viem";
import { TokenABI } from "../constants";
import { sendTransaction, getDecimals } from "../services";
import { AgentkitAction } from "../agentkit";
import axios from "axios";
import { numberToHex, concat, size } from "viem";

const SWAP_PROMPT = `
This tool will swap tokens using 1inch Protocol.

It takes the following inputs:
- fromTokenAddress: The address of the token to swap from (use 'eth' for native ETH)
- toTokenAddress: The address of the token to swap to
- amount: The amount to swap in human readable format
- slippageTolerance: Maximum acceptable slippage in basis points (e.g., 100 = 1%)

Important notes:
- Swaps are only available on supported networks: Avalanche C-Chain, BASE, BNB chain
- When swapping native ETH, ensure sufficient balance for the swap AND gas costs
- Slippage tolerance defaults to 1% if not specified
`;

const ZERO_EX_API_KEY = "598c2ec5-1ba9-4d18-9ea3-44dc8107992b";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const headers = {
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
};

/**
 * Input schema for swap action.
 */
export const SwapInput = z
  .object({
    fromTokenAddress: z.string().describe("The address of the token to swap from"),
    toTokenAddress: z.string().describe("The address of the token to swap to"),
    amount: z.string().describe("The amount to swap"),
    slippageTolerance: z
      .number()
      .default(100)
      .describe("Maximum acceptable slippage in basis points"),
  })
  .strip()
  .describe("Instructions for swapping tokens");

/**
 * Swaps tokens using 1inch Protocol.
 *
 * @param wallet - The smart account to swap from.
 * @param args - The input arguments for the action.
 * @returns A message containing the swap details.
 */
export async function swap(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SwapInput>,
): Promise<string> {
  try {
    const walletAddress = await wallet.getAddress();
    const chainId = await wallet.rpcProvider.getChainId();
    const isFromEth = args.fromTokenAddress.toLowerCase() === "eth";

    // Get token decimals and calculate amount with proper decimals
    const decimals = isFromEth ? 18 : await getDecimals(wallet, args.fromTokenAddress);
    const amountWithDecimals = parseUnits(args.amount, Number(decimals)).toString();

    // Check and set allowance for Permit2 if needed
    if (!isFromEth) {
      const tokenContract = getContract({
        address: args.fromTokenAddress as `0x${string}`,
        abi: TokenABI,
        client: wallet.rpcProvider,
      });

      const currentAllowance = (await tokenContract.read.allowance([
        walletAddress as `0x${string}`,
        PERMIT2_ADDRESS as `0x${string}`,
      ])) as bigint;

      if (currentAllowance < BigInt(amountWithDecimals)) {
        const approveData = encodeFunctionData({
          abi: TokenABI,
          functionName: "approve",
          args: [PERMIT2_ADDRESS, amountWithDecimals],
        });

        await sendTransaction(wallet, {
          to: args.fromTokenAddress,
          data: approveData,
          value: 0n,
        });
      }
    }

    // Get quote with permit2
    const quoteParams = new URLSearchParams({
      chainId: chainId.toString(),
      sellToken: isFromEth ? "ETH" : args.fromTokenAddress,
      buyToken: args.toTokenAddress,
      sellAmount: amountWithDecimals,
      takerAddress: walletAddress,
      slippagePercentage: (args.slippageTolerance / 10000).toString(),
    });

    const quoteResponse = await axios.get(
      `https://api.0x.org/swap/permit2/quote?${quoteParams.toString()}`,
      { headers },
    );

    let txData = quoteResponse.data.transaction.data;

    // If permit2 signature is required, sign and append to transaction data
    if (quoteResponse.data.permit2?.eip712) {
      const signature = await wallet.signTypedData(quoteResponse.data.permit2.eip712);

      // Append signature length (32 bytes) and signature to transaction data
      const signatureLengthHex = numberToHex(size(signature), {
        signed: false,
        size: 32,
      });

      txData = concat([txData, signatureLengthHex as `0x${string}`, signature as `0x${string}`]);
    }

    // Execute swap transaction with permit2 signature
    const receipt = await sendTransaction(wallet, {
      to: quoteResponse.data.transaction.to,
      data: txData,
      value: BigInt(isFromEth ? amountWithDecimals : 0),
    });

    return `Successfully swapped ${args.amount} ${isFromEth ? "ETH" : args.fromTokenAddress} 
            to ${args.toTokenAddress}. TX: ${receipt.userOpHash}`;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data?.reason) {
      return `Swap failed: ${error.response.data.reason}`;
    }
    return `Swap failed: ${error instanceof Error ? error.message : error}`;
  }
}

/**
 * Swap action.
 */
export class SwapAction implements AgentkitAction<typeof SwapInput> {
  public name = "swap";
  public description = SWAP_PROMPT;
  public argsSchema = SwapInput;
  public func = swap;
  public smartAccountRequired = true;
}
