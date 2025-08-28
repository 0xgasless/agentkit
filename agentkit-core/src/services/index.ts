export * from "./keyManagementService";
import {
  ZeroXgaslessSmartAccount,
  Transaction,
  PaymasterMode,
  BalancePayload,
  UserOpResponse,
  UserOpReceipt,
  createSmartAccountClient,
} from "@0xgasless/smart-account";
import { TokenABI, tokenMappings } from "../constants";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, getContract, parseUnits, createPublicClient, http } from "viem";
import { formatEther } from "viem";
import { TransactionResponse, TransactionStatus, TokenDetails } from "../types";
import type { Account } from "viem/accounts";
import { createWalletClient, http as httpTransport, defineChain } from "viem";

const DEFAULT_WAIT_INTERVAL = 5000; // 5 seconds
const DEFAULT_MAX_DURATION = 30000; // 30 seconds
export const isNodeLikeEnvironment =
  typeof process !== "undefined" && process.versions != null && process.versions.node != null;

const useEoa = () => String(process.env.USE_EOA || "false").toLowerCase() === "true";
export const isEoaMode = () => useEoa();

/**
 * Creates a new 0xGasless Smart Account on the default chain.
 *
 * Default chain: Avalanche C-Chain (43114)
 * Also supported (configure via your own params elsewhere):
 * - BSC (56)
 * - Sonic (146)
 * - Moonbeam (1284)
 */
export async function createWallet() {
  const wallet = generatePrivateKey();
  const account = privateKeyToAccount(wallet);

  const smartAccount = await createSmartAccountClient({
    // Default to Avalanche C-Chain
    bundlerUrl: "https://bundler.0xgasless.com/43114",
    paymasterUrl: "https://paymaster.0xgasless.com/v1/43114/rpc/YOUR_API_KEY",
    chainId: 43114,
    signer: account,
  });
  if (isNodeLikeEnvironment) {
    const importedModule = await import("sqlite3");
    const db = new importedModule.Database("keys.db");
    db.run("INSERT INTO keys (address, private_key) VALUES (?, ?)", [
      smartAccount.getAddress(),
      wallet,
    ]);
  }
  return smartAccount;
}

/**
 * Optional: Create and use a traditional EOA (externally-owned account) wallet.
 * Useful when you want to bypass Account Abstraction for certain flows.
 */
export type EoaWallet = {
  address: `0x${string}`;
  account: Account;
  client: ReturnType<typeof createWalletClient>;
};

/**
 * Create an EOA wallet client for a given RPC and chain id.
 * Defaults to Avalanche (43114) to match AA defaults.
 */
export function createEoaWallet(options: {
  privateKey: `0x${string}`;
  rpcUrl: string;
  chainId?: number;
}): EoaWallet {
  const { privateKey, rpcUrl } = options;
  const chainId = options.chainId ?? 43114;
  const account = privateKeyToAccount(privateKey);

  // Minimal chain definition; callers can supply their own if needed.
  const customChain = defineChain({
    id: chainId,
    name: `custom-${chainId}`,
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const client = createWalletClient({ account, chain: customChain, transport: httpTransport(rpcUrl) });
  return { address: account.address as `0x${string}`, account, client };
}

/**
 * Resolve or create the active EOA client from env
 */
export function getEoaFromEnv(): EoaWallet | null {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const rpc = process.env.RPC_URL as string | undefined;
  const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;
  if (!pk || !rpc) return null;
  return createEoaWallet({ privateKey: pk, rpcUrl: rpc, chainId });
}
export async function getActiveAddress(wallet: ZeroXgaslessSmartAccount): Promise<`0x${string}`> {
  if (useEoa()) {
    const eoa = getEoaFromEnv();
    if (!eoa) throw new Error("EOA not configured");
    return eoa.address;
  }
  return (await wallet.getAddress()) as `0x${string}`;
}

/**
 * Send a basic EOA transaction.
 * Mirrors the AA Transaction shape (to, data, value) where possible.
 */
export async function sendEoaTransaction(
  eoa: EoaWallet,
  tx: Pick<Transaction, "to" | "data" | "value">,
): Promise<TransactionResponse> {
  try {
    const hash = await eoa.client.sendTransaction({
      account: eoa.account,
      chain: eoa.client.chain,
      to: tx.to as `0x${string}`,
      data: (tx.data as `0x${string}` | undefined),
      value:
        typeof tx.value === "bigint"
          ? tx.value
          : tx.value !== undefined
            ? BigInt(tx.value as unknown as string)
            : undefined,
    });
    return { success: true, txHash: hash } as TransactionResponse;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } as TransactionResponse;
  }
}

/**
 * Unified send: routes to EOA or Smart Account based on USE_EOA.
 */
export async function sendTransaction(
  wallet: ZeroXgaslessSmartAccount,
  tx: Transaction,
): Promise<TransactionResponse> {
  if (useEoa()) {
    const eoa = getEoaFromEnv();
    if (!eoa) {
      return { success: false, error: "EOA not configured. Set PRIVATE_KEY, RPC_URL, CHAIN_ID." };
    }
    return sendEoaTransaction(eoa, tx);
  }
  try {
    const request = await wallet.sendTransaction(tx, {
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED,
      },
    });

    if (request.error) {
      return {
        success: false,
        error: request.error,
      };
    }

    const receipt = await request.wait();

    if (receipt.reason) {
      return {
        success: false,
        error: receipt.reason,
      };
    }
    if (receipt.success && receipt.receipt?.transactionHash) {
      return {
        success: true,
        txHash: receipt.receipt?.transactionHash,
        message: `Transaction confirmed!\nTx Hash: ${receipt.receipt?.transactionHash}\n\n.`,
        receipt,
      };
    }
    return {
      success: false,
      error: `Transaction failed: ${receipt.reason}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Transaction Error: ${error}`,
    };
  }
}

/**
 * Waits for a transaction to be confirmed and returns the status
 * @param wallet The smart account to use for checking status
 * @param userOpHashOrResponse The user operation hash or response object
 * @param options Optional configuration for waiting
 * @returns The transaction status
 */
export async function waitForTransaction(
  wallet: ZeroXgaslessSmartAccount,
  userOpHashOrResponse: string | UserOpResponse,
  options: {
    confirmations?: number;
    maxDuration?: number;
    interval?: number;
  } = {},
): Promise<TransactionStatus> {
  const {
    confirmations = 1,
    maxDuration = DEFAULT_MAX_DURATION,
    interval = DEFAULT_WAIT_INTERVAL,
  } = options;

  // Extract userOpHash from response if needed
  const userOpHash =
    typeof userOpHashOrResponse === "string"
      ? userOpHashOrResponse
      : userOpHashOrResponse.userOpHash;

  let totalDuration = 0;

  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      try {
        // Get the receipt from bundler
        const bundlerUrl = wallet.bundler?.getBundlerUrl();
        if (!bundlerUrl) {
          throw new Error("Bundler URL not found");
        }
        const response = await fetch(bundlerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            method: "eth_getUserOperationReceipt",
            params: [userOpHash],
            id: Date.now(),
            jsonrpc: "2.0",
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch receipt: ${response.statusText}`);
        }

        const data = await response.json();
        const receipt = data.result as UserOpReceipt;

        if (receipt?.receipt?.blockNumber) {
          if (confirmations > 1) {
            // Check block confirmations if required
            const latestBlock = await wallet.rpcProvider.getBlockNumber();
            const confirmedBlocks = Number(latestBlock) - receipt.receipt.blockNumber;

            if (confirmedBlocks >= confirmations) {
              clearInterval(intervalId);
              resolve({
                status: "confirmed",
                receipt,
                blockNumber: receipt.receipt.blockNumber,
                blockConfirmations: confirmedBlocks,
              });
              return;
            }
          } else {
            clearInterval(intervalId);
            resolve({
              status: "confirmed",
              receipt,
              blockNumber: receipt.receipt.blockNumber,
              blockConfirmations: 1,
            });
            return;
          }
        }

        // Update duration and check timeout
        totalDuration += interval;
        if (totalDuration >= maxDuration) {
          clearInterval(intervalId);
          resolve({
            status: "pending",
            error: `Exceeded maximum duration (${maxDuration / 1000} sec) waiting for transaction`,
          });
        }
      } catch (error) {
        clearInterval(intervalId);
        resolve({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }, interval);
  });
}

/**
 * Reads (decimals, balanceOf, etc.) route through RPC provider for smart account,
 * or viem public client for EOA.
 */
function getPublicClientForEoa() {
  const rpc = process.env.RPC_URL as string | undefined;
  if (!rpc) return null;
  return createPublicClient({ transport: http(rpc) });
}

export async function getDecimals(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: string,
): Promise<bigint | false> {
  if (useEoa()) {
    const pc = getPublicClientForEoa();
    if (!pc) return false;
    try {
      const decimals = (await pc.readContract({
        abi: TokenABI,
        address: tokenAddress as `0x${string}`,
        functionName: "decimals",
      })) as bigint;
      return decimals || false;
    } catch {
      return false;
    }
  }
  const decimals = (await wallet.rpcProvider.readContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    functionName: "decimals",
  })) as bigint;
  if (!decimals || decimals === BigInt(0)) {
    return false;
  }
  return decimals;
}

export async function getWalletBalance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress?: `0x${string}`[],
): Promise<BalancePayload[] | false> {
  if (useEoa()) {
    try {
      const eoa = getEoaFromEnv();
      const pc = getPublicClientForEoa();
      if (!eoa || !pc) return false;
      const native = await pc.getBalance({ address: eoa.address });
      const balances: BalancePayload[] = [
        { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", formattedAmount: formatEther(native) } as unknown as BalancePayload,
      ];
      if (tokenAddress && tokenAddress.length > 0) {
        for (const addr of tokenAddress) {
          try {
            const bal = (await pc.readContract({
              abi: TokenABI,
              address: addr,
              functionName: "balanceOf",
              args: [eoa.address],
            })) as bigint;
            const dec = (await pc.readContract({
              abi: TokenABI,
              address: addr,
              functionName: "decimals",
            })) as number;
            const denom = BigInt(10) ** BigInt(dec);
            const whole = bal / denom;
            const frac = bal % denom;
            const formatted = `${whole}.${frac.toString().padStart(dec, "0").replace(/0+$/, "") || "0"}`;
            balances.push({ address: addr, formattedAmount: formatted } as unknown as BalancePayload);
          } catch (_e) {
            balances.push({ address: addr, formattedAmount: "0" } as unknown as BalancePayload);
          }
        }
      }
      return balances;
    } catch {
      return false;
    }
  }
  const balance = await wallet.getBalances(tokenAddress);
  if (!balance) {
    return false;
  }
  return balance;
}

export async function fetchTokenDetails(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: string,
): Promise<TokenDetails | false> {
  if (useEoa()) {
    const pc = getPublicClientForEoa();
    if (!pc) return false;
    try {
      const [name, symbol, decimals] = await Promise.all([
        pc.readContract({ abi: TokenABI, address: tokenAddress as `0x${string}`, functionName: "name" }) as Promise<string>,
        pc.readContract({ abi: TokenABI, address: tokenAddress as `0x${string}`, functionName: "symbol" }) as Promise<string>,
        pc.readContract({ abi: TokenABI, address: tokenAddress as `0x${string}`, functionName: "decimals" }) as Promise<number>,
      ]);
      return {
        name,
        symbol,
        decimals: BigInt(decimals),
        address: tokenAddress as `0x${string}`,
        chainId: Number(process.env.CHAIN_ID || 0),
      } as TokenDetails;
    } catch {
      return false;
    }
  }
  const tokenContract = getContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    client: wallet.rpcProvider,
  });
  const name = await tokenContract.read.name();
  const symbol = await tokenContract.read.symbol();
  const decimals = await tokenContract.read.decimals();
  if (!name || !symbol || !decimals) {
    return false;
  }
  return {
    name,
    symbol,
    decimals,
    address: tokenAddress as `0x${string}`,
    chainId: wallet.rpcProvider.chain?.id ?? 0,
  } as TokenDetails;
}

/**
 * Resolves token symbols to their contract addresses based on the current chain
 *
 * @param wallet - The smart account to get chain information from
 * @param symbol - Token symbol to resolve
 * @returns Token address or null if not found
 */
export async function resolveTokenSymbol(
  wallet: ZeroXgaslessSmartAccount,
  symbol: string,
): Promise<`0x${string}` | null> {
  const chainId = wallet.rpcProvider.chain?.id;
  if (!chainId || !tokenMappings[chainId]) {
    console.warn(`Chain ID ${chainId} not found in token mappings`);
    return null;
  }

  const chainTokens = tokenMappings[chainId];
  const normalizedSymbol = symbol.toUpperCase();

  if (chainTokens[normalizedSymbol]) {
    return chainTokens[normalizedSymbol];
  }

  // Special case for native token (ETH, AVAX, BNB, etc.)
  if (
    normalizedSymbol === "ETH" ||
    normalizedSymbol === "AVAX" ||
    normalizedSymbol === "BNB" ||
    normalizedSymbol === "FTM" ||
    normalizedSymbol === "S" ||
    normalizedSymbol === "GLMR"
  ) {
    return "0x0000000000000000000000000000000000000000";
  }

  console.warn(`Token symbol ${normalizedSymbol} not found for chain ID ${chainId}`);
  return null;
}

/**
 * Format amount with proper decimals for the API
 *
 * @param wallet - The smart account to use for querying
 * @param tokenAddress - The token address
 * @param amount - The human-readable amount (e.g., "0.001")
 * @returns The amount formatted with proper decimals
 */
export async function formatTokenAmount(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  amount: string,
): Promise<string> {
  try {
    // For native token (address 0x0)
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return parseUnits(amount, 18).toString();
    }

    // Get token decimals
    const decimals = await getDecimals(wallet, tokenAddress);
    if (!decimals) {
      throw new Error(`Could not get decimals for token ${tokenAddress}`);
    }

    // Parse the amount with proper decimals
    return parseUnits(amount, Number(decimals)).toString();
  } catch (error) {
    console.error("Error formatting token amount:", error);
    // Fallback to assuming 18 decimals if we can't get the actual decimals
    return parseUnits(amount, 18).toString();
  }
}

/**
 * Check token allowance for a spender
 *
 * @param wallet - The smart account to use
 * @param tokenAddress - The token address to check allowance for
 * @param spenderAddress - The address that needs allowance
 * @returns Current allowance as bigint or false if failed
 */
export async function checkTokenAllowance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<bigint> {
  try {
    // Skip for native token
    if (
      tokenAddress === "0x0000000000000000000000000000000000000000" ||
      tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    ) {
      return BigInt(0);
    }
    const userAddress = useEoa()
      ? (getEoaFromEnv()?.address as `0x${string}`)
      : await wallet.getAddress();
    if (useEoa()) {
      const pc = getPublicClientForEoa();
      if (!pc || !userAddress) return BigInt(0);
      const allowance = (await pc.readContract({
        abi: TokenABI,
        address: tokenAddress,
        functionName: "allowance",
        args: [userAddress, spenderAddress],
      })) as bigint;
      return allowance;
    }
    const allowance = (await wallet.rpcProvider.readContract({
      abi: TokenABI,
      address: tokenAddress,
      functionName: "allowance",
      args: [userAddress, spenderAddress],
    })) as bigint;

    return allowance;
  } catch (error) {
    console.error("Error checking token allowance:", error);
    return BigInt(0);
  }
}

/**
 * Approve token spending for a spender
 *
 * @param wallet - The smart account to use
 * @param tokenAddress - The token address to approve
 * @param spenderAddress - The address to approve spending for
 * @param amount - The amount to approve (or max uint256 for unlimited)
 * @returns Transaction response
 */
export async function approveToken(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint,
): Promise<TransactionResponse> {
  try {
    // Skip approval for native token
    if (
      tokenAddress === "0x0000000000000000000000000000000000000000" ||
      tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    ) {
      return { success: true, userOpHash: "" };
    }

    // Create approval transaction
    const tx = {
      to: tokenAddress,
      data: encodeFunctionData({
        abi: TokenABI,
        functionName: "approve",
        args: [spenderAddress, amount],
      }),
      value: BigInt(0),
    };

    // Send approval transaction (routes based on USE_EOA)
    return await sendTransaction(wallet, tx as Transaction);
  } catch (error) {
    console.error("Error approving token:", error);
    return {
      success: false,
      userOpHash: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check and approve token allowance if needed
 *
 * @param wallet - The smart account to use
 * @param tokenAddress - The token address to check allowance for
 * @param spenderAddress - The address that needs allowance
 * @param amount - The amount that needs to be approved
 * @param approveMax - Whether to approve maximum amount
 * @returns Success status and any error message
 */
export async function checkAndApproveTokenAllowance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint,
  approveMax: boolean = false,
): Promise<TransactionResponse> {
  if (
    tokenAddress === "0x0000000000000000000000000000000000000000" ||
    tokenAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
  ) {
    return { success: true, userOpHash: "" };
  }
  const currentAllowance = await checkTokenAllowance(wallet, tokenAddress, spenderAddress);
  console.log(`Current allowance: ${currentAllowance}, Required: ${amount}`);
  if (currentAllowance >= amount && !approveMax) {
    console.log("Allowance is sufficient, no need to approve");
    return { success: true, userOpHash: "" };
  }
  const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const approvalAmount = approveMax ? maxUint256 : amount;
  return await approveToken(wallet, tokenAddress, spenderAddress, approvalAmount);
}
