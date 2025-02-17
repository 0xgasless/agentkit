import { z } from "zod";
import axios from "axios";
import {
  parseEther,
  parseUnits,
  encodeFunctionData,
} from "viem";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import { SwapRouter, Trade, Route, FeeAmount } from '@uniswap/v3-sdk';
import { getPool, getUniswapV3Pool, WRAPPED_NATIVE_TOKEN } from './uniswap';

import {
  getWalletBalance,
  sendTransaction,
  getDecimals,
  createWallet,
  fetchTokenDetails,
} from "./services";
import { TokenABI } from "./constants";
import { AgentkitAction, ActionSchemaAny, Agentkit } from "./agentkit";

const GET_BALANCE_PROMPT = `
This tool will get the balance of the smart account associated with the wallet. 
When no token addresses are provided, it returns the ETH balance by default.
When token addresses are provided, it returns the balance for each token.

Note: This action works on supported networks only (Base, Fantom, Moonbeam, Metis, Avalanche, BSC).
`;

export const GetBalanceInput = z
  .object({
    tokenAddresses: z
      .array(z.string())
      .optional()
      .describe("Optional list of token addresses to get balances for"),
  })
  .strip()
  .describe("Instructions for getting smart account balance");

/**
 * Gets balance for the smart account.
 *
 * @param wallet - The smart account to get the balance for.
 * @param args - The input arguments for the action.
 * @returns A message containing the balance information.
 */
export async function getBalance(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetBalanceInput>,
): Promise<string> {
  try {
    // Convert string addresses to 0x format if provided
    const tokenAddresses = args.tokenAddresses?.map(addr => addr as `0x${string}`);
    const balances = await getWalletBalance(wallet, tokenAddresses);

    // Format the balance response
    const balanceStrings = balances.map(
      balance => `${balance.address}: ${balance.formattedAmount}`,
    );
    return `Smart Account Balances:\n${balanceStrings.join("\n")}`;
  } catch (error) {
    return `Error getting balance: ${error}`;
  }
}

/**
 * Get wallet balance action.
 */
export class GetBalanceAction implements AgentkitAction<typeof GetBalanceInput> {
  public name = "get_balance";
  public description = GET_BALANCE_PROMPT;
  public argsSchema = GetBalanceInput;
  public func = getBalance;
  public smartAccountRequired = true;
}

const SMART_TRANSFER_PROMPT = `
This tool will transfer an ERC20 token from the wallet to another onchain address using gasless transactions.

It takes the following inputs:
- amount: The amount to transfer
- tokenAddress: The token contract address (use 'eth' for native ETH transfers)
- destination: Where to send the funds (must be a valid onchain address)

Important notes:
- Gasless transfers are only available on supported networks: Avalanche C-Chain, Metis chain, BASE, BNB chain, FANTOM, Moonbeam 
`;

/**
 * Input schema for smart transfer action.
 */
export const SmartTransferInput = z
  .object({
    amount: z.string().describe("The amount of tokens to transfer"),
    tokenAddress: z
      .string()
      .describe("The token contract address or 'eth' for native ETH transfers"),
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

    const receipt = await sendTransaction(wallet, tx);
    if (!receipt) {
      return "Transaction failed";
    }
    return `Successfully transferred ${args.amount} ${isEth ? "ETH" : `tokens from contract ${args.tokenAddress}`
      } to ${args.destination}.\nTransaction hash: ${receipt.transactionHash}`;
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

const SWAP_PROMPT = `
This tool will swap tokens using Uniswap V3 Protocol.

It takes the following inputs:
- fromTokenAddress: The address of the token to swap from (use 'eth' for native ETH)
- toTokenAddress: The address of the token to swap to
- amount: The amount to swap in human readable format
- slippageTolerance: Maximum acceptable slippage in basis points (e.g., 100 = 1%)

Important notes:
- Swaps are available on supported networks with Uniswap V3 deployment
- When swapping native ETH, ensure sufficient balance for the swap AND gas costs
- Slippage tolerance defaults to 1% if not specified
`;

const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

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
 * Swaps tokens using Uniswap V3 Protocol.
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
    console.log('Smart Account Address:', walletAddress);

    const chainId = await wallet.rpcProvider.getChainId();
    const isFromEth = args.fromTokenAddress.toLowerCase() === "eth";

    // Get token decimals and details
    const fromDecimals = isFromEth ? 18 : await getDecimals(wallet, args.fromTokenAddress);
    const toDecimals = await getDecimals(wallet, args.toTokenAddress);
    
    console.log('Swap Details:', {
      fromToken: args.fromTokenAddress,
      toToken: args.toTokenAddress,
      amount: args.amount,
      fromDecimals,
      toDecimals
    });

    // Create token instances
    const fromToken = new Token(
      chainId,
      isFromEth ? WRAPPED_NATIVE_TOKEN[chainId] : args.fromTokenAddress,
      Number(fromDecimals)
    );
    const toToken = new Token(chainId, args.toTokenAddress, Number(toDecimals));

    // Calculate amount with decimals
    const amountIn = parseUnits(args.amount, Number(fromDecimals));

    // Get pool with best liquidity
    const { pool } = await getUniswapV3Pool(wallet, fromToken, toToken, chainId);

    // Create route and trade
    const route = new Route([pool], fromToken, toToken);
    const trade = await Trade.createUncheckedTrade({
      route,
      inputAmount: CurrencyAmount.fromRawAmount(fromToken, amountIn.toString()),
      outputAmount: CurrencyAmount.fromRawAmount(toToken, '0'),
      tradeType: TradeType.EXACT_INPUT,
    });

    // Prepare swap parameters
    const slippageTolerance = new Percent(args.slippageTolerance, 10000);
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

    const methodParameters = SwapRouter.swapCallParameters(trade, {
      slippageTolerance,
      recipient: walletAddress,
      deadline,
    });

    // Execute swap
    const receipt = await sendTransaction(wallet, {
      to: UNISWAP_V3_ROUTER,
      data: methodParameters.calldata,
      value: BigInt(isFromEth ? amountIn.toString() : 0),
    });

    // After successful swap, get transaction details
    const txHash = receipt.transactionHash;
    const receiptDetails = await wallet.rpcProvider.waitForTransactionReceipt({
      hash: txHash as `0x${string}`
    });

    // Log detailed transaction info
    console.log('Transaction Details:', {
      hash: receiptDetails.transactionHash,
      from: receiptDetails.from,
      to: receiptDetails.to,
      status: receiptDetails.status === 'success' ? 'Success' : 'Failed',
      logs: receiptDetails.logs.map(log => ({
        address: log.address,
        topics: log.topics,
        data: log.data
      }))
    });

    // Parse transfer events
    const transfers = receiptDetails.logs
      .filter(log => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') // Transfer event
      .map(log => ({
        token: log.address,
        from: `0x${log.topics[1]?.slice(26)}`,
        to: `0x${log.topics[2]?.slice(26)}`,
        amount: BigInt(log.data).toString()
      }));

    console.log('Token Transfers:', transfers);

    return `Swap completed successfully!\n
            Transaction Hash: ${receiptDetails.transactionHash}\n
            From Token: ${args.fromTokenAddress}\n
            To Token: ${args.toTokenAddress}\n
            Amount: ${args.amount}\n
            Transfers: ${JSON.stringify(transfers, null, 2)}`;

  } catch (error) {
    console.error('Swap error:', error);
    return `Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
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

const CREATE_WALLET_PROMPT = `
This tool will create a temporary wallet by generating a new private key.
WARNING: This is for temporary use only. Do not use for storing significant funds.
`;

export const CreateWalletInput = z
  .object({})
  .strip()
  .describe("No inputs needed - generates a new private key");

/**
 * Creates a temporary wallet by generating a private key.
 *
 * @returns A message containing the private key.
 */
export async function createTempWallet(): Promise<string> {
  try {
    const privateKey = createWallet();
    return `Generated temporary private key: ${privateKey}\n\nWARNING: Store this safely and do not share it with anyone. This key is for temporary use only.`;
  } catch (error) {
    return `Error creating wallet: ${error}`;
  }
}

/**
 * Create wallet action.
 */
export class CreateWalletAction implements AgentkitAction<typeof CreateWalletInput> {
  public name = "create_wallet";
  public description = CREATE_WALLET_PROMPT;
  public argsSchema = CreateWalletInput;
  public func = createTempWallet;
  public smartAccountRequired = false;
}

const GET_TOKEN_DETAILS_PROMPT = `
This tool will fetch details about an ERC20 token including:
- Token name
- Token symbol
- Decimals
- Contract address
- Chain ID

Provide the token contract address to get its details.
`;

export const GetTokenDetailsInput = z
  .object({
    tokenAddress: z.string().describe("The ERC20 token contract address"),
  })
  .strip()
  .describe("Instructions for getting token details");

/**
 * Gets details about an ERC20 token.
 *
 * @param wallet - The smart account to use for querying.
 * @param args - The input arguments containing the token address.
 * @returns A message containing the token details.
 */
export async function getTokenDetails(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTokenDetailsInput>,
): Promise<string> {
  try {
    const details = await fetchTokenDetails(wallet, args.tokenAddress);
    return `
    Token Details:
            Name: ${details.name}
            Symbol: ${details.symbol}
            Decimals: ${details.decimals}
            Address: ${details.address}
            Chain ID: ${details.chainId}
    `;
  } catch (error) {
    return `Error getting token details: ${error}`;
  }
}

/**
 * Get token details action.
 */
export class GetTokenDetailsAction implements AgentkitAction<typeof GetTokenDetailsInput> {
  public name = "get_token_details";
  public description = GET_TOKEN_DETAILS_PROMPT;
  public argsSchema = GetTokenDetailsInput;
  public func = getTokenDetails;
  public smartAccountRequired = true;
}

const GET_ADDRESS_PROMPT = `
This tool will return the smart account address associated with the current wallet.
The address returned is the counterfactual address of the smart account that will be used for transactions.
`;

export const GetAddressInput = z
  .object({})
  .strip()
  .describe("No inputs needed - returns the smart account address");

/**
 * Gets the smart account address.
 *
 * @param wallet - The smart account to get the address for.
 * @returns A message containing the smart account address.
 */
export async function getSmartAccountAddress(agentkit: Agentkit): Promise<string> {
  try {
    const address = await agentkit.getAddress();
    return `Smart Account Address: ${address}`;
  } catch (error) {
    return `Error getting smart account address: ${error}`;
  }
}

/**
 * Get smart account address action.
 */
export class GetAddressAction implements AgentkitAction<typeof GetAddressInput> {
  public name = "get_address";
  public description = GET_ADDRESS_PROMPT;
  public argsSchema = GetAddressInput;
  public func = async (
    wallet: ZeroXgaslessSmartAccount,
    _args: z.infer<typeof GetAddressInput>,
  ) => {
    const address = await wallet.getAddress();
    return `Smart Account Address: ${address}`;
  };
  public smartAccountRequired = true;
}

const TOKEN_ANALYSIS_PROMPT = `
This tool provides comprehensive token analysis using CoinMarketCap data. It can:
- Get latest cryptocurrency listings and market data
- Fetch detailed token information and quotes
- Show upcoming airdrops
- Display market pairs and trading information
- Get global market metrics

Required Setup:
- Set CMC_API_KEY environment variable with your CoinMarketCap API key

Input options:
- type: Type of analysis ('listings', 'quotes', 'info', 'airdrops', 'marketPairs', 'global')
- symbol: Token symbol (e.g., 'BTC', 'ETH')
- limit: Number of results (default: 10)

Note: You must have a valid CoinMarketCap API key set in your environment variables as CMC_API_KEY.
`;

export const TokenAnalysisInput = z
  .object({
    type: z.enum(["listings", "quotes", "info", "airdrops", "marketPairs", "global"]),
    symbol: z.string().optional(),
    limit: z.number().optional().default(10),
  })
  .strip()
  .describe("Instructions for analyzing token data from CoinMarketCap");

interface CoinData {
  name: string;
  symbol: string;
  quote: {
    USD: {
      price: number;
    };
  };
}

/**
 * Analyzes token data using CoinMarketCap API.
 */
export async function analyzeToken(args: z.infer<typeof TokenAnalysisInput>): Promise<string> {
  try {
    const api = axios.create({
      baseURL: "https://pro-api.coinmarketcap.com/v1",
      headers: {
        "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
        Accept: "application/json",
      },
    });

    switch (args.type) {
      case "listings": {
        const response = await api.get("/cryptocurrency/listings/latest", {
          params: { limit: args.limit },
        });
        const listings = response.data.data.map(
          (coin: CoinData) => `${coin.name} (${coin.symbol}): $${coin.quote.USD.price.toFixed(2)}`,
        );
        return `Latest Cryptocurrency Listings:\n${listings.join("\n")}`;
      }

      case "quotes": {
        if (!args.symbol) throw new Error("Symbol is required for quotes");
        const response = await api.get("/cryptocurrency/quotes/latest", {
          params: { symbol: args.symbol },
        });
        const quote = response.data.data[args.symbol].quote.USD;
        return `
          ${args.symbol} Quote:
          Price: $${quote.price.toFixed(2)}
          24h Change: ${quote.percent_change_24h.toFixed(2)}%
          Market Cap: $${quote.market_cap.toFixed(0)}
          Volume 24h: $${quote.volume_24h.toFixed(0)}
        `;
      }

      // Add other cases for different analysis types...

      default:
        return `Unsupported analysis type: ${args.type}`;
    }
  } catch (error) {
    if (error instanceof Error) {
      return `Error analyzing token: ${error.message}`;
    }
    return "Unknown error occurred during token analysis";
  }
}

/**
 * Token analysis action.
 */
export class TokenAnalysisAction implements AgentkitAction<typeof TokenAnalysisInput> {
  public name = "analyze_token";
  public description = TOKEN_ANALYSIS_PROMPT;
  public argsSchema = TokenAnalysisInput;
  public func = analyzeToken;
  public smartAccountRequired = true;
}

/**
 * Retrieves all AgentkitAction instances.
 * WARNING: All new AgentkitAction classes must be instantiated here to be discovered.
 *
 * @returns - Array of AgentkitAction instances
 */
export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new SmartTransferAction(),
    new SwapAction(),
    new CreateWalletAction(),
    new GetTokenDetailsAction(),
    new GetAddressAction(),
    new TokenAnalysisAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();

// export { AgentkitAction, ActionSchemaAny, GetBalanceAction, SmartTransferAction, SwapAction };
