import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { AgentkitAction } from "../../agentkit";
import * as fs from "fs";
import * as path from "path";
import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  avalancheFuji,
  polygonAmoy,
  baseSepolia,
  sepolia,
  bscTestnet,
  arbitrumSepolia,
  optimismSepolia,
} from "viem/chains";

const DEPLOY_CONTRACT_PROMPT = `
This tool deploys a compiled smart contract to the blockchain.
It searches for the contract artifact (JSON) in the workspace (specifically looking for Foundry/Hardhat 'out' directories).

Required parameters:
- contractName: The name of the contract to deploy (e.g., "CREReceiver").
- constructorArgs: (Optional) Array of arguments to pass to the constructor.

Optional parameters:
- baseDir: Specific directory to search for artifacts (defaults to workspace root).
`;

export const DeployContractInput = z
  .object({
    contractName: z.string().describe("The name of the contract to deploy (e.g., 'CREReceiver')"),
    constructorArgs: z.array(z.any()).optional().describe("Array of constructor arguments"),
    baseDir: z.string().optional().describe("Optional base directory for artifact search"),
  })
  .strip()
  .describe("Instructions for deploying a smart contract");

// Helper to recursively find file
function findFile(startPath: string, filter: string): string | null {
  if (!fs.existsSync(startPath)) return null;

  const files = fs.readdirSync(startPath);
  for (const file of files) {
    const filename = path.join(startPath, file);
    const stat = fs.lstatSync(filename);
    if (stat.isDirectory()) {
      // Skip node_modules and hidden dirs to speed up
      if (file === "node_modules" || file.startsWith(".")) continue;
      const found = findFile(filename, filter);
      if (found) return found;
    } else if (filename.endsWith(filter)) {
      return filename;
    }
  }
  return null;
}

async function deployContract(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DeployContractInput>,
): Promise<string> {
  try {
    const cwd = args.baseDir || path.resolve(__dirname, "../../../../../"); // Fallback to assumed workspace root
    const artifactName = `${args.contractName}.json`;

    console.log(`[DeployContract] Searching for ${artifactName} in ${cwd}...`);
    const artifactPath = findFile(cwd, artifactName);

    if (!artifactPath) {
      return `Error: Could not find artifact '${artifactName}' in ${cwd}. Please ensure the contract is compiled using Foundry or Hardhat.`;
    }

    console.log(`[DeployContract] Found artifact at ${artifactPath}`);
    const artifactContent = fs.readFileSync(artifactPath, "utf-8");
    const artifact = JSON.parse(artifactContent);

    // Extract ABI and Bytecode (Foundry/Hardhat standard format)
    const abi = artifact.abi;
    const bytecode = artifact.bytecode?.object || artifact.bytecode; // Handle Foundry vs Hardhat differences

    if (!abi || !bytecode) {
      return `Error: Invalid artifact format. Missing ABI or Bytecode.`;
    }

    // Deploy using Smart Account (if supported) or fallback to EOA via Viem
    // Since 0xGasless SmartAccount might not expose a direct "deploy" method easily compatible with arbitrary bytecode without UserOp encoding manually,
    // we will use the EOA (Private Key) from env if available for this "superuser" action.
    // Ideally, we should use the Smart Account's deploy method if available.
    // Checking wallet capabilities... the `wallet` object passed here is `ZeroXgaslessSmartAccount`.

    // For now, to ensure reliability for this generic action, we'll try to use the underlying signer if possible,
    // or assume we are in the MCP environment with PRIVATE_KEY set.

    // Check if we have a private key in process.env to use with Viem directly for deployment
    const privateKey = process.env.PRIVATE_KEY || process.env.CRE_ETH_PRIVATE_KEY;

    if (!privateKey) {
      return `Error: Deployment requires PRIVATE_KEY or CRE_ETH_PRIVATE_KEY to be set in environment.`;
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Determine chain from environment or default (MCP sets CHAIN_ID)
    const chainId = Number(process.env.CHAIN_ID) || 43113; // Default to Fuji
    // Map common chain IDs to Viem chains
    const chains: Record<number, any> = {
      43113: avalancheFuji,
      80002: polygonAmoy,
      84532: baseSepolia,
      11155111: sepolia,
      97: bscTestnet,
      421614: arbitrumSepolia,
      11155420: optimismSepolia,
    };

    const chain = chains[chainId] || avalancheFuji;
    const rpcUrl = process.env.RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    console.log(`[DeployContract] Deploying ${args.contractName} to chain ${chainId}...`);

    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: args.constructorArgs || [],
      chain,
    });

    console.log(`[DeployContract] Transaction sent: ${hash}`);

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.contractAddress) {
      return `
Contract Deployed Successfully!
Contract Name: ${args.contractName}
Address: ${receipt.contractAddress}
Transaction Hash: ${hash}
Block Number: ${receipt.blockNumber}
        `;
    } else {
      return `Deployment Transaction Success, but no contract address returned. Hash: ${hash}`;
    }
  } catch (error: any) {
    return `Error deploying contract: ${error.message}`;
  }
}

export class DeployContractAction implements AgentkitAction<typeof DeployContractInput> {
  public name = "deploy_smart_contract";
  public description = DEPLOY_CONTRACT_PROMPT;
  public argsSchema = DeployContractInput;
  public func = deployContract;
  public smartAccountRequired = false; // We use Viem directly for now
}
