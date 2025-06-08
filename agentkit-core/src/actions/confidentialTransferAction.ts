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

const SMART_CONFIDENTIAL_TRANSFER_PROMPT = `
This tools allows you to perform confidential transfer on Avalanche C-Chain.

It takes the following inputs:
- amount: The amount to deposit
- tokenTicker: The token symbol (currently only USDC is supported)
- destinationAddress: The address to which the tokens will be transferred

USAGE GUIDANCE:
- Provide the amount to deposit in the input token's units
- Provide the token symbol (currently only "USDC" is supported)
- Provider the destination address to which the tokens will be transferred

EXAMPLES:
- "Transfer 50 USDC tokens to 0x1234567890abcdef1234567890abcdef12345678 privately"
- "Make confidential transfer of 100 usdc to 0x1234567890abcdef1234567890abcdef12345678"

Important notes:
- This action is only available on Avalanche C-Chain and only support USDC token transfers.
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
export const SmartConfidentialTransferInput = z
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
export async function smartConfidentialTransfer(
    wallet: ZeroXgaslessSmartAccount,
    args: z.infer<typeof SmartConfidentialTransferInput>,
): Promise<string> {
    try {
        let confidentialTransferTxn: Transaction;
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
        const transferTokenTxn = await eTokenClient.getTransferTxn(args.destinationAddress, parseUnits(args.amount, DECIMALS as number), PlaintextType.uint64);
        confidentialTransferTxn = {
            to: transferTokenTxn.to as `0x${string}`,
            data: transferTokenTxn.data,
            value: 0n, // No native currency value for token transfers
        }
        const confidentialTransferResponse = await sendTransaction(wallet, confidentialTransferTxn);

        if (!confidentialTransferResponse || !confidentialTransferResponse.success) {
            return `Transaction failed: ${confidentialTransferResponse?.error || "Unknown error"}`;
        }

        return `The transaction has been confirmed on the blockchain. Successfully transferred ${args.amount} tokens privately
            to ${args.destinationAddress}. Transaction Hash: ${confidentialTransferResponse.txHash}`;
    } catch (error) {
        return `Error depositing asset: ${error}`;
    }
}

/**
 * Smart Confidential Transfer Action.
 */
export class SmartConfidentialTransferAction implements AgentkitAction<typeof SmartConfidentialTransferInput> {
    public name = "smart_confidential_transfer";
    public description = SMART_CONFIDENTIAL_TRANSFER_PROMPT;
    public argsSchema = SmartConfidentialTransferInput;
    public func = smartConfidentialTransfer;
    public smartAccountRequired = true;
}
