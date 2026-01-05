/**
 * ViaLabs Cross-Chain Bridge Action
 *
 * Enables AI agents to bridge tokens across chains using ViaLabs
 * cross-chain messaging infrastructure.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseUnits, createPublicClient, http } from "viem";
import type { AgentkitAction } from "../../agentkit";
import { sendTransaction } from "../../services";
import {
  ViaLabsBridgeABI,
  isVialabsChainSupported,
  getVialabsChainConfig,
  getSupportedChainIds,
} from "./vialabsConstants";
import {
  isRouteSupported,
  getVialabsTokenInfo,
  getVialabsTokenBalance,
  isDestinationChainActive,
  formatBridgeSummary,
  getSupportedChainsSummary,
} from "./vialabsHelpers";

const VIALABS_BRIDGE_PROMPT = `
This tool bridges tokens across different blockchains using ViaLabs cross-chain messaging.

It takes the following inputs:
- tokenAddress: The address of the ViaLabs-enabled token contract to bridge
- destChainId: The destination chain ID to bridge tokens to
- recipient: The recipient address on the destination chain
- amount: The amount of tokens to bridge (as a string, e.g., "10.5")

Important notes:
- The token contract must be a ViaLabs-enabled cross-chain token (extends MessageClient)
- Both source and destination chains must be configured on the token contract
- Tokens are burned on the source chain and minted on the destination chain
- This is NOT a wrapped token bridge - it's native cross-chain token transfer
- The action will wait and track until tokens arrive on destination chain

Supported chains include: Avalanche, Avalanche Fuji (testnet), Base, Base Sepolia (testnet), BNB Chain.

Example usage:
"Bridge 100 tokens from contract 0x... to Base Sepolia chain (84532) for recipient 0x..."
`;

/**
 * Input schema for ViaLabs bridge action
 */
export const ViaLabsBridgeInput = z
  .object({
    tokenAddress: z.string().describe("The ViaLabs-enabled token contract address to bridge from"),
    destChainId: z.number().describe("The destination chain ID to bridge tokens to"),
    recipient: z.string().describe("The recipient address on the destination chain"),
    amount: z.string().describe("The amount of tokens to bridge (e.g., '10.5')"),
  })
  .strip()
  .describe("Input for bridging tokens across chains using ViaLabs");

// ERC20 ABI for balance checking
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Chain RPC endpoints for destination tracking
const CHAIN_RPC_ENDPOINTS: Record<number, string> = {
  43113: "https://api.avax-test.network/ext/bc/C/rpc", // Avalanche Fuji
  84532: "https://sepolia.base.org", // Base Sepolia
  43114: "https://api.avax.network/ext/bc/C/rpc", // Avalanche Mainnet
  8453: "https://mainnet.base.org", // Base Mainnet
  56: "https://bsc-dataseed.binance.org/", // BNB Chain
};

// Chain explorers for transaction links
const CHAIN_EXPLORERS: Record<number, string> = {
  43113: "https://testnet.snowtrace.io/tx/",
  84532: "https://sepolia.basescan.org/tx/",
  43114: "https://snowtrace.io/tx/",
  8453: "https://basescan.org/tx/",
  56: "https://bscscan.com/tx/",
};

// Destination token addresses (same order as HELLO_ERC20_TESTNET_TOKENS)
const DESTINATION_TOKEN_ADDRESSES: Record<number, `0x${string}`> = {
  43113: "0xc8600dE63d7cbA25967ecf4894be84dB1c9Ee137", // Avalanche Fuji
  84532: "0xb9dB93d419bEDc2C20fe39248D560E7CB1aAABD0", // Base Sepolia
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log step with formatting
 */
function logStep(step: number, message: string, data?: Record<string, string | number>) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`\n[ViaLabs] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[ViaLabs] STEP ${step}: ${message}`);
  console.log(`[ViaLabs] Time: ${timestamp}`);
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      console.log(`[ViaLabs]   ${key}: ${value}`);
    }
  }
  console.log(`[ViaLabs] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

/**
 * Get balance on destination chain
 */
async function getDestinationBalance(
  destChainId: number,
  tokenAddress: `0x${string}`,
  recipient: `0x${string}`,
): Promise<bigint> {
  const rpcUrl = CHAIN_RPC_ENDPOINTS[destChainId];
  if (!rpcUrl) {
    throw new Error(`No RPC endpoint for chain ${destChainId}`);
  }

  // Get the destination token address
  const destTokenAddress = DESTINATION_TOKEN_ADDRESSES[destChainId] || tokenAddress;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const balance = await client.readContract({
    address: destTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [recipient],
  });

  return balance;
}

/**
 * Bridge tokens across chains using ViaLabs with destination tracking
 */
export async function vialabsBridge(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof ViaLabsBridgeInput>,
): Promise<string> {
  try {
    const sourceChainId = wallet.rpcProvider.chain?.id;
    const startTime = Date.now();
    let currentStep = 0;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   VIALABS CROSS-CHAIN BRIDGE - STARTING`);
    console.log(`${"═".repeat(60)}\n`);

    if (!sourceChainId) {
      return "Error: Could not determine source chain ID from wallet.";
    }

    const sourceConfig = getVialabsChainConfig(sourceChainId);
    const destConfig = getVialabsChainConfig(args.destChainId);

    // Step 1: Validate chains
    currentStep++;
    logStep(currentStep, "VALIDATING CHAINS", {
      "Source Chain": `${sourceConfig?.name || sourceChainId} (${sourceChainId})`,
      "Destination Chain": `${destConfig?.name || args.destChainId} (${args.destChainId})`,
    });

    if (!isVialabsChainSupported(sourceChainId)) {
      return `Error: Source chain ${sourceChainId} is not supported by ViaLabs.\n\n${getSupportedChainsSummary()}`;
    }

    if (!isVialabsChainSupported(args.destChainId)) {
      return `Error: Destination chain ${args.destChainId} is not supported by ViaLabs.\n\n${getSupportedChainsSummary()}`;
    }

    if (!isRouteSupported(sourceChainId, args.destChainId)) {
      return `Error: Route from chain ${sourceChainId} to ${args.destChainId} is not supported.`;
    }

    if (sourceChainId === args.destChainId) {
      return "Error: Cannot bridge to the same chain. Use a regular transfer instead.";
    }

    console.log(`[ViaLabs]   ✅ Chains validated successfully`);

    const tokenAddress = args.tokenAddress as `0x${string}`;
    const recipient = args.recipient as `0x${string}`;

    // Step 2: Get token info
    currentStep++;
    logStep(currentStep, "FETCHING TOKEN INFO", {
      "Token Contract": tokenAddress,
    });

    const tokenInfo = await getVialabsTokenInfo(wallet, tokenAddress);
    if (!tokenInfo) {
      return `Error: Could not get token info for ${tokenAddress}. Make sure this is a valid ViaLabs-enabled token contract.`;
    }

    console.log(`[ViaLabs]   Token Name: ${tokenInfo.name}`);
    console.log(`[ViaLabs]   Token Symbol: ${tokenInfo.symbol}`);
    console.log(`[ViaLabs]   Decimals: ${tokenInfo.decimals}`);
    console.log(`[ViaLabs]   ✅ Token info retrieved`);

    // Step 3: Check destination chain is active
    currentStep++;
    logStep(currentStep, "CHECKING DESTINATION CHAIN CONFIG", {
      "Destination Chain ID": args.destChainId,
    });

    const isActive = await isDestinationChainActive(wallet, tokenAddress, args.destChainId);
    if (!isActive) {
      return `Error: Destination chain ${destConfig?.name || args.destChainId} is not configured on this token contract.`;
    }
    console.log(`[ViaLabs]   ✅ Destination chain is active and configured`);

    // Step 4: Get wallet address
    currentStep++;
    logStep(currentStep, "GETTING WALLET ADDRESS");

    let walletAddress: `0x${string}`;
    try {
      walletAddress = (await wallet.getAddress()) as `0x${string}`;
      console.log(`[ViaLabs]   Wallet Type: Smart Account`);
    } catch (_addrError) {
      const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
      const rpc = process.env.RPC_URL;
      const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;

      if (!pk || !rpc) {
        return `Error: Could not get wallet address. No PRIVATE_KEY or RPC_URL configured.`;
      }

      const { createEoaWallet } = await import("../../services");
      const eoa = createEoaWallet({ privateKey: pk, rpcUrl: rpc, chainId });
      walletAddress = eoa.address as `0x${string}`;
      console.log(`[ViaLabs]   Wallet Type: EOA (Externally Owned Account)`);
    }

    console.log(`[ViaLabs]   Address: ${walletAddress}`);
    console.log(`[ViaLabs]   ✅ Wallet address retrieved`);

    // Step 5: Check balance
    currentStep++;
    logStep(currentStep, "CHECKING TOKEN BALANCE", {
      "Amount to Bridge": `${args.amount} ${tokenInfo.symbol}`,
    });

    const balance = await getVialabsTokenBalance(wallet, tokenAddress, walletAddress);
    const amountBigInt = parseUnits(args.amount, tokenInfo.decimals);
    const formattedBalance = (Number(balance) / 10 ** tokenInfo.decimals).toFixed(6);

    console.log(`[ViaLabs]   Current Balance: ${formattedBalance} ${tokenInfo.symbol}`);
    console.log(`[ViaLabs]   Required Amount: ${args.amount} ${tokenInfo.symbol}`);

    if (balance < amountBigInt) {
      console.log(`[ViaLabs]   ❌ Insufficient balance!`);
      return `Error: Insufficient balance. You have ${formattedBalance} ${tokenInfo.symbol} but trying to bridge ${args.amount} ${tokenInfo.symbol}.`;
    }
    console.log(`[ViaLabs]   ✅ Sufficient balance confirmed`);

    // Step 6: Get initial destination balance
    currentStep++;
    logStep(currentStep, "CHECKING INITIAL DESTINATION BALANCE", {
      Recipient: recipient,
      Chain: destConfig?.name || String(args.destChainId),
    });

    let initialDestBalance: bigint;
    try {
      initialDestBalance = await getDestinationBalance(args.destChainId, tokenAddress, recipient);
      const formattedInitial = (Number(initialDestBalance) / 10 ** tokenInfo.decimals).toFixed(6);
      console.log(`[ViaLabs]   Initial Balance: ${formattedInitial} ${tokenInfo.symbol}`);
    } catch (_e) {
      initialDestBalance = 0n;
      console.log(`[ViaLabs]   Initial Balance: 0 (could not fetch)`);
    }
    console.log(`[ViaLabs]   ✅ Initial balance recorded`);

    // Step 7: Execute bridge transaction
    currentStep++;
    logStep(currentStep, "EXECUTING BRIDGE TRANSACTION", {
      Action: "Burn tokens & send cross-chain message",
      Amount: `${args.amount} ${tokenInfo.symbol}`,
      "To Chain": destConfig?.name || String(args.destChainId),
    });

    const data = encodeFunctionData({
      abi: ViaLabsBridgeABI,
      functionName: "bridge",
      args: [BigInt(args.destChainId), recipient, amountBigInt],
    });

    const tx: Transaction = {
      to: tokenAddress,
      data,
      value: 0n,
    };

    console.log(`[ViaLabs]   Sending transaction...`);
    const response = await sendTransaction(wallet, tx);

    if (!response || !response.success) {
      console.log(`[ViaLabs]   ❌ Transaction failed!`);
      return `Bridge transaction failed: ${response?.error || "Unknown error"}`;
    }

    const txTime = Date.now();
    const explorerUrl = `${CHAIN_EXPLORERS[sourceChainId] || ""}${response.txHash}`;

    console.log(`[ViaLabs]   ✅ TRANSACTION CONFIRMED!`);
    console.log(`[ViaLabs]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[ViaLabs]   TX Hash: ${response.txHash}`);
    console.log(`[ViaLabs]   Explorer: ${explorerUrl}`);
    console.log(`[ViaLabs]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Step 8: Wait for ViaLabs validators
    currentStep++;
    logStep(currentStep, "WAITING FOR VIALABS VALIDATORS", {
      Status: "Cross-chain message submitted to validator network",
      Polling: "Checking destination chain every 15 seconds",
    });

    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
    const pollInterval = 15 * 1000; // Check every 15 seconds
    let elapsed = 0;
    let bridgeCompleted = false;
    let finalDestBalance = initialDestBalance;
    let pollCount = 0;

    while (elapsed < maxWaitTime) {
      await sleep(pollInterval);
      elapsed = Date.now() - txTime;
      pollCount++;

      try {
        finalDestBalance = await getDestinationBalance(args.destChainId, tokenAddress, recipient);

        if (finalDestBalance > initialDestBalance) {
          bridgeCompleted = true;
          break;
        }
      } catch (_e) {
        // Continue polling on error
      }

      const elapsedSecs = Math.floor(elapsed / 1000);
      const mins = Math.floor(elapsedSecs / 60);
      const secs = elapsedSecs % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      console.log(
        `[ViaLabs] ⏳ Polling #${pollCount} - ${timeStr} elapsed - Waiting for validators...`,
      );
    }

    // Step 9: Report final result
    currentStep++;
    const totalTime = Date.now() - startTime;
    const totalSeconds = Math.floor(totalTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    if (bridgeCompleted) {
      const receivedAmount = finalDestBalance - initialDestBalance;
      const formattedReceived = (Number(receivedAmount) / 10 ** tokenInfo.decimals).toFixed(6);
      const finalBalanceFormatted = (Number(finalDestBalance) / 10 ** tokenInfo.decimals).toFixed(
        6,
      );

      logStep(currentStep, "BRIDGE COMPLETE! ✅", {
        "Burned on Source": `${args.amount} ${tokenInfo.symbol}`,
        "Minted on Destination": `${formattedReceived} ${tokenInfo.symbol}`,
        "New Balance": `${finalBalanceFormatted} ${tokenInfo.symbol}`,
        "Total Time": timeString,
      });

      console.log(`\n${"═".repeat(60)}`);
      console.log(`   🎉 VIALABS CROSS-CHAIN BRIDGE - SUCCESS!`);
      console.log(`${"═".repeat(60)}\n`);

      const summary = formatBridgeSummary({
        tokenSymbol: tokenInfo.symbol,
        amount: args.amount,
        sourceChainId,
        destChainId: args.destChainId,
        recipient: args.recipient,
        txHash: response.txHash,
      });

      return (
        `✅ CROSS-CHAIN BRIDGE COMPLETE!\n\n${summary}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎉 TOKENS RECEIVED ON DESTINATION CHAIN!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Source TX: ${response.txHash}\n` +
        `Explorer: ${explorerUrl}\n\n` +
        `   • Source: ${sourceConfig?.name || sourceChainId} ✅ (burned ${args.amount} ${tokenInfo.symbol})\n` +
        `   • ViaLabs Validators: Relayed ✅\n` +
        `   • Destination: ${destConfig?.name || args.destChainId} ✅ (minted ${formattedReceived} ${tokenInfo.symbol})\n\n` +
        `⏱️ Total cross-chain time: ${timeString}\n` +
        `📊 ViaLabs validator processing verified!`
      );
    } else {
      logStep(currentStep, "BRIDGE PENDING ⏳", {
        Status: "Validators still processing",
        "Time Elapsed": timeString,
      });

      console.log(`\n${"═".repeat(60)}`);
      console.log(`   ⏳ VIALABS CROSS-CHAIN BRIDGE - PENDING`);
      console.log(`${"═".repeat(60)}\n`);

      const summary = formatBridgeSummary({
        tokenSymbol: tokenInfo.symbol,
        amount: args.amount,
        sourceChainId,
        destChainId: args.destChainId,
        recipient: args.recipient,
        txHash: response.txHash,
      });

      return (
        `✅ SOURCE CHAIN TRANSACTION CONFIRMED!\n\n${summary}\n\n` +
        `Source TX: ${response.txHash}\n` +
        `Explorer: ${explorerUrl}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ VIALABS VALIDATORS PROCESSING...\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Time waited: ${timeString}\n` +
        `The tokens should arrive soon on ${destConfig?.name || args.destChainId}.\n\n` +
        `Destination Token: ${DESTINATION_TOKEN_ADDRESSES[args.destChainId] || tokenAddress}\n` +
        `Recipient: ${recipient}`
      );
    }
  } catch (error) {
    console.log(`[ViaLabs] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error executing ViaLabs bridge: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * ViaLabs Bridge Action class
 */
export class ViaLabsBridgeAction implements AgentkitAction<typeof ViaLabsBridgeInput> {
  public name = "vialabs_bridge";
  public description = VIALABS_BRIDGE_PROMPT;
  public argsSchema = ViaLabsBridgeInput;
  public func = vialabsBridge;
  public smartAccountRequired = true;
}
