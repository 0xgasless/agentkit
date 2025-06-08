import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseUnits } from "viem";
import {
  TokenABI,
  EERC20DepositContractABI,
  depositContractMappings,
  tokenMappings,
} from "../constants";
import { sendTransaction } from "../services";
import { AgentkitAction } from "../agentkit";

const SMART_DEPOSIT_PROMPT = `
This tools allows you to perform gas token deposits on Avalanche C-Chain.

It takes the following inputs:
- amount: The amount to deposit
- tokenTicker: The token symbol (currently only USDC is supported)

USAGE GUIDANCE:
- Provide the amount to deposit in the input token's units
- Provide the token symbol (currently only "USDC" is supported)

EXAMPLES:
- "Deposit 50 USDC tokens"
- "Deposit 100 usdc for confidential transfers"
- "Deposit 10 usdc"
- "deposit 1 usdc"

Important notes:
- This action is only available on Avalanche C-Chain and only support USDC token deposits.
- The transaction will be submitted and the tool will wait for confirmation by default.
`;

const AVALANCHE_CHAIN_ID = "43114";
const DECIMALS = 6; // USDC has 6 decimals and we've enabled deposit for USDC only

/**
 * @param tokenTicker - The ticker symbol of the token (e.g., "USDC")
 * @description fetching deposit contract address for a particular token
 */
const getDepositTokenContractAddress = (ticker: string): `0x${string}` => {
  const tokenDepositContractAddress = depositContractMappings["43114"][ticker];
  return tokenDepositContractAddress as `0x${string}`;
};

/**
 * @param ticker - The ticker symbol of the token (e.g., "USDC")
 * @description fetching token address for a particular token
 */
const getTokenAddress = (ticker: string): `0x${string}` => {
  const token = tokenMappings[AVALANCHE_CHAIN_ID];
  const tokenSymbols = Object.keys(token);
  const tokenAddresses = Object.values(token);
  const index = tokenSymbols.indexOf(ticker.toUpperCase());
  return tokenAddresses[index] as `0x${string}`;
};

/**
 * Input schema for smart deposit action.
 */
export const SmartDepositInput = z
  .object({
    amount: z.string().describe("The amount of tokens to transfer"),
    tokenTicker: z.string().describe("The token ticker (currently only 'USDC' is supported)"),
  })
  .strip()
  .describe(
    "Instructions for depositing tokens from a smart account to an deposit contract for confidential transfers",
  );

/**
 * Transfers assets using gasless transactions.
 *
 * @param wallet - The smart account to transfer from.
 * @param args - The input arguments for the action.
 * @returns A message containing the transfer details.
 */
export async function smartDeposit(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartDepositInput>,
): Promise<string> {
  try {
    let approvalTxn: Transaction, depositAndWrapTxn: Transaction;
    const smartAccountAddress = (await wallet.getAccountAddress()) as `0x${string}`;
    const depositTokenContractAddress = getDepositTokenContractAddress(
      args.tokenTicker.toUpperCase(),
    );
    const tokenAddress = getTokenAddress(args.tokenTicker.toUpperCase());
    const approvalTxnData = encodeFunctionData({
      abi: TokenABI,
      functionName: "approve",
      args: [depositTokenContractAddress, parseUnits(args.amount, DECIMALS as number)],
    });

    const depositAndWrapTxnData = encodeFunctionData({
      abi: EERC20DepositContractABI,
      functionName: "depositAndWrap",
      args: [smartAccountAddress, parseUnits(args.amount, DECIMALS as number)],
    });

    approvalTxn = {
      to: tokenAddress,
      data: approvalTxnData,
      value: 0n,
    };

    depositAndWrapTxn = {
      to: depositTokenContractAddress,
      data: depositAndWrapTxnData,
      value: 0n,
    };

    const approvalResponse = await sendTransaction(wallet, approvalTxn);
    const depositAndWrapResponse = await sendTransaction(wallet, depositAndWrapTxn);

    if (!approvalResponse || !approvalResponse.success) {
      return `Transaction failed: ${approvalResponse?.error || "Unknown error"}`;
    }

    if (!depositAndWrapResponse || !depositAndWrapResponse.success) {
      return `Transaction failed: ${depositAndWrapResponse?.error || "Unknown error"}`;
    }

    return `The transaction has been confirmed on the blockchain. Successfully deposited ${args.amount} tokens from contract ${tokenAddress}
            } to ${depositTokenContractAddress}. Transaction Hash: ${depositAndWrapResponse.txHash}`;
  } catch (error) {
    return `Error depositing asset: ${error}`;
  }
}

/**
 * Smart transfer action.
 */
export class SmartDepositAction implements AgentkitAction<typeof SmartDepositInput> {
  public name = "smart_deposit";
  public description = SMART_DEPOSIT_PROMPT;
  public argsSchema = SmartDepositInput;
  public func = smartDeposit;
  public smartAccountRequired = true;
}
