import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseUnits } from "viem";
import { TokenABI, EERC20DepositContractABI, depositContractMappings, tokenMappings } from "../constants";
import { sendTransaction } from "../services";
import { AgentkitAction } from "../agentkit";

const SMART_DEPOSIT_PROMPT = `
This tool will deposit an ERC20 token from the wallet to deposit contract using gasless transactions.

It takes the following inputs:
- amount: The amount to deposit
- tokenAddress: The token contract address (for now it only accepts USDC token address)

Important notes:
- Deposit action is only available on Avalanche C-Chain and only support USDC token deposits
- Gasless transfers are only available on supported networks: Avalanche C-Chain, Metis chain, BASE, BNB chain, FANTOM, Moonbeam.
- The transaction will be submitted and the tool will wait for confirmation by default.
`;

const AVALANCHE_CHAIN_ID = "43114";
const DECIMALS = 6; // USDC has 6 decimals and we've enabled deposit for USDC only

const getTokenTicker = (tokenAddress: string): string => {
    const token = tokenMappings[AVALANCHE_CHAIN_ID];
    let tokenSymbols = Object.keys(token);
    let tokenAddresses = Object.values(token);
    let index = tokenAddresses.indexOf(tokenAddress as `0x${string}`);
    return tokenSymbols[index];;
}

/** 
 * @param tokenAddress
 * @description fetching deposit contract address for a particular token
 */
const getDepositTokenContractAddress = (tokenAddress: string): `0x${string}` => {
    let ticker = getTokenTicker(tokenAddress);
    let tokenDepositContractAddress = depositContractMappings['43114'][ticker];
    return tokenDepositContractAddress as `0x${string}`;
}

/**
 * Input schema for smart deposit action.
 */
export const SmartDepositInput = z
    .object({
        amount: z.string().describe("The amount of tokens to transfer"),
        tokenAddress: z
            .string()
            .describe("The token contract address"),
    })
    .strip()
    .describe("Instructions for depositing tokens from a smart account to an deposit contract for confidential transfers");


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
        const depositTokenContractAddress = getDepositTokenContractAddress(args.tokenAddress);
        const approvalTxnData = encodeFunctionData({
            abi: TokenABI,
            functionName: "approve",
            args: [
                depositTokenContractAddress,
                parseUnits(args.amount, (DECIMALS as number)),
            ],
        });
        const depositAndWrapTxnData = encodeFunctionData({
            abi: EERC20DepositContractABI,
            functionName: "depositAndWrap",
            args: [
                smartAccountAddress,
                parseUnits(args.amount, (DECIMALS as number)),
            ],
        });

        approvalTxn = {
            to: args.tokenAddress,
            data: approvalTxnData,
            value: 0n,
        }

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

        return `The transaction has been confirmed on the blockchain. Successfully deposited ${args.amount} tokens from contract ${args.tokenAddress}
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
