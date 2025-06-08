import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { parseUnits } from "viem";
import {
    depositContractMappings,
    tokenMappings,
} from "../constants";
import { sendTransaction } from "../services";
import { AgentkitAction } from "../agentkit";
import { EncryptedToken, TokenConfig, SUPPORTED_CHAINS, SUPPORTED_TOKENS, PlaintextType } from 'petcrypt-js-lite';

const SMART_WITHDRAW_TOKEN_PROMPT = `
This tools allows you to perform withdrawal of your deposited token on Avalanche C-Chain.

It takes the following inputs:
- amount: The amount to deposit
- tokenTicker: The token symbol (currently only USDC is supported)
- destinationAddress: The address to which the withdrawal tokens will be transferred

USAGE GUIDANCE:
- Provide the amount to deposit in the input token's units
- Provide the token symbol (currently only "USDC" is supported)
- Provider the destination address to which the tokens will be transferred

EXAMPLES:
- "Withdraw 50 USDC tokens to 0x1234567890abcdef1234567890abcdef12345678 privately"

Important notes:
- This action is only available on Avalanche C-Chain and only support USDC token withdrawals.
- The transaction will be submitted and the tool will wait for confirmation by default.
`;

const getChainEnum = (chainId: number): SUPPORTED_CHAINS => {
    switch (chainId) {
        case 43114: // Avalanche C-Chain
            return SUPPORTED_CHAINS.AVALANCHE;
        default:
            throw new Error(`Unsupported chain ID: ${chainId}`);
    }
}

const getTokenEnum = (): SUPPORTED_TOKENS => {
    return SUPPORTED_TOKENS.USDC; // Currently only USDC is supported for confidential transfers
}

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
export const SmartWithdrawalTokenInput = z
    .object({
        amount: z.string().describe("The amount of tokens to transfer"),
        tokenTicker: z.string().describe("The token ticker (currently only 'USDC' is supported)"),
        destinationAddress: z
            .string()
            .describe("The address to which the tokens will be transferred"),
    })
    .strip()
    .describe(
        "Instructions for transfering tokens from a smart account to an destination address confidentially",
    );

/**
 * Transfers assets using gasless transactions.
 *
 * @param wallet - The smart account to transfer from.
 * @param args - The input arguments for the action.
 * @returns A message containing the transfer details.
 */
export async function smartWithdrawAction(
    wallet: ZeroXgaslessSmartAccount,
    args: z.infer<typeof SmartWithdrawalTokenInput>,
): Promise<string> {
    try {
        let withdrawalApprovalTxn: Transaction, withdrawalTokenTxn: Transaction;
        const depositTokenContractAddress = getDepositTokenContractAddress(
            args.tokenTicker.toUpperCase(),
        );
        const tokenAddress = getTokenAddress(args.tokenTicker.toUpperCase());
        const tokenEnum = getTokenEnum();
        const chainEnum = getChainEnum(wallet.rpcProvider.chain?.id || 43114); // Default to Avalanche C-Chain if chainId is not set
        const tokenConfig: TokenConfig = {
            token: tokenEnum,
            chains: chainEnum
        };
        const eTokenClient = new EncryptedToken(tokenConfig);
        const withdrawTxn = await eTokenClient.getUnWrappingTxn(parseUnits(args.amount, DECIMALS as number), PlaintextType.uint64, args.destinationAddress);
        withdrawalApprovalTxn = {
            to: withdrawTxn[0].to as `0x${string}`,
            data: withdrawTxn[0].data,
            value: 0n, // No native currency value for token transfers
        }

        withdrawalTokenTxn = {
            to: withdrawTxn[1].to as `0x${string}`,
            data: withdrawTxn[1].data,
            value: 0n, // No native currency value for token transfers
        }
        const approvalResponse = await sendTransaction(wallet, withdrawalApprovalTxn);
        const withdrawalTokenResponse = await sendTransaction(wallet, withdrawalTokenTxn);

        if (!approvalResponse || !approvalResponse.success) {
            return `Approval transaction failed: ${approvalResponse?.error || "Unknown error"}`;
        }

        if (!withdrawalTokenResponse || !withdrawalTokenResponse.success) {
            return `Transaction failed: ${withdrawalTokenResponse?.error || "Unknown error"}`;
        }

        return `The transaction has been confirmed on the blockchain. Successfully withdrawal ${args.amount} tokens
            } to ${args.destinationAddress}. Transaction Hash: ${withdrawalTokenResponse.txHash}`;
    } catch (error) {
        return `Error depositing asset: ${error}`;
    }
}

/**
 * Smart Token Withdraw Action.
 */
export class SmartWithdrawTokenAction implements AgentkitAction<typeof SmartWithdrawalTokenInput> {
    public name = "smart_token_withdrawal";
    public description = SMART_WITHDRAW_TOKEN_PROMPT;
    public argsSchema = SmartWithdrawalTokenInput;
    public func = smartWithdrawAction;
    public smartAccountRequired = true;
}
