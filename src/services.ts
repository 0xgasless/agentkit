import {
  ZeroXgaslessSmartAccount,
  Transaction,
  PaymasterMode,
  BalancePayload,
} from "@0xgasless/smart-account";
import { TokenABI } from "./constants";
import { generatePrivateKey } from "viem/accounts";
import { getContract } from "viem";
import { Agentkit } from "./agentkit";

/**
 * get token details
 * send transcations
 * get wallet balance
 * get decimals
 *
 */

export type TokenDetails = {
  name: string;
  symbol: string;
  decimals: bigint;
  address: `0x${string}`;
  chainId: number;
};

export function createWallet() {
  const wallet = generatePrivateKey();
  return wallet;
}

export async function sendTransaction(wallet: ZeroXgaslessSmartAccount, tx: Transaction) {
  const request = await wallet.sendTransaction(tx, {
    paymasterServiceData: {
      mode: PaymasterMode.SPONSORED,
    },
  });
  if (request.error) {
    return false;
  }
  const txResponse = await request.wait();
  const receipt = await txResponse.receipt;
  return receipt;
}

export async function getDecimals(wallet: ZeroXgaslessSmartAccount, tokenAddress: string) {
  const decimals = (await wallet.rpcProvider.readContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    functionName: "decimals",
  })) as bigint;
  return decimals;
}

export async function getWalletBalance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress?: `0x${string}`[],
): Promise<BalancePayload[]> {
  const balance = await wallet.getBalances(tokenAddress);
  return balance;
}

export async function fetchTokenDetails(wallet: ZeroXgaslessSmartAccount, tokenAddress: string) {
  const tokenContract = getContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    client: wallet.rpcProvider,
  });
  const name = await tokenContract.read.name();
  const symbol = await tokenContract.read.symbol();
  const decimals = await tokenContract.read.decimals();
  return {
    name,
    symbol,
    decimals,
    address: tokenAddress as `0x${string}`,
    chainId: wallet.rpcProvider.chain?.id ?? 0,
  } as TokenDetails;
}

export async function getCMCData(type: string, symbol?: string, limit: number = 10) {
  const cmcApiKey = process.env.NEXT_PUBLIC_CMC_API_KEY;
  if (!cmcApiKey) {
    throw new Error("CMC API key is required for token analysis");
  }

  const baseUrl = "https://pro-api.coinmarketcap.com/v1";
  let endpoint = "";

  switch (type) {
    case "listings":
      endpoint = `/cryptocurrency/listings/latest?limit=${limit}`;
      break;
    case "quotes":
      if (!symbol) throw new Error("Symbol is required for quotes");
      endpoint = `/cryptocurrency/quotes/latest?symbol=${symbol}`;
      break;
    case "info":
      if (!symbol) throw new Error("Symbol is required for info");
      endpoint = `/cryptocurrency/info?symbol=${symbol}`;
      break;
    case "marketPairs":
      if (!symbol) throw new Error("Symbol is required for market pairs");
      endpoint = `/cryptocurrency/market-pairs/latest?symbol=${symbol}&limit=${limit}`;
      break;
    case "global":
      endpoint = "/global-metrics/quotes/latest";
      break;
    default:
      throw new Error("Invalid analysis type");
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      "X-CMC_PRO_API_KEY": cmcApiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CMC API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export async function getSmartAccountAddress(agentkit: Agentkit): Promise<string> {
  try {
    const address = await agentkit.getAddress();
    if (!address) {
      throw new Error("Could not get smart account address");
    }
    return address;
  } catch (error) {
    throw new Error(`Failed to get smart account address: ${error}`);
  }
}
