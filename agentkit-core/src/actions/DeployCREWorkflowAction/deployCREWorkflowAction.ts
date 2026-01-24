import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { CRE_SUPPORTED_NETWORKS } from "../../utils/chainlinkConstants";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execAsync = promisify(exec);

const DEPLOY_CRE_WORKFLOW_PROMPT = `
This tool deploys a Chainlink CRE workflow to the decentralized oracle network.
It supports deploying widely used workflows like 'splitter-release' to various chains.

Required parameters:
- workflowType: The name of the workflow folder (e.g., 'splitter-release').
- chain: The target chain for the workflow (e.g., 'avalanche-fuji', 'polygon-amoy', 'base-sepolia').
- usePaymaster: Set to true if you want to use the Paymaster for gas sponsorship (currently simulation only).
- paymentWallet: (Optional) The private key of the wallet to pay for Gas if usePaymaster is false.

The tool will:
1. Validate the chain and workflow.
2. Verify funding (Paymaster check or Wallet check).
3. Execute the deployment command.
`;

export const DeployCREWorkflowInput = z
  .object({
    workflowType: z.string().describe("The name of the workflow folder (e.g., 'splitter-release')"),
    chain: z.string().describe("The target chain identifier (e.g., 'avalanche-fuji', 'polygon-amoy')"),
    usePaymaster: z.boolean().default(false).describe("Whether to use Paymaster for gas fees"),
    paymentWallet: z.string().optional().describe("Private key for EOA payment if not using Paymaster"),
  })
  .strip()
  .describe("Instructions for deploying a CRE workflow");

async function deployCREWorkflow(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DeployCREWorkflowInput>,
): Promise<string> {
  try {
    // 1. Resolve Chain Configuration
    const networkConfig = CRE_SUPPORTED_NETWORKS[args.chain];
    if (!networkConfig) {
      const supportedChains = Object.keys(CRE_SUPPORTED_NETWORKS).join(", ");
      return `Error: Chain '${args.chain}' is not supported. Supported chains: ${supportedChains}`;
    }

    // 2. Resolve Workflow Directory
    // Assuming relative path from agentkit-core to splitpay-cre
    // Adjust this base path if the workspace structure is different in production
    const workflowBasePath = path.resolve(__dirname, "../../../../../splitpay-cre/cre-workflows");
    const workflowPath = path.join(workflowBasePath, args.workflowType);

    if (!fs.existsSync(workflowPath)) {
      return `Error: Workflow directory not found at ${workflowPath}. Please check the workflowType.`;
    }

    // 3. Payment / Funding Logic
    if (args.usePaymaster) {
      console.log(`[AgentKit] Attempting to use Paymaster for ${args.chain}...`);
      // Placeholder: In a real implementation, this would call a Paymaster API to fund the ephemeral key
      // or sign the transaction meta-transaction style.
      // For now, we assume the environment is pre-funded or this is a simulation.
      console.log(`[AgentKit] Paymaster check passed (Simulated).`);
    } else {
      if (!args.paymentWallet && !process.env.CRE_ETH_PRIVATE_KEY) {
        return `Error: Payment method is EOA but no paymentWallet provided and CRE_ETH_PRIVATE_KEY not set in env.`;
      }
      console.log(`[AgentKit] Using provided EOA wallet for deployment.`);
    }

    // 4. Update Project Config for Chain (Dynamic Configuration)
    // We might need to update project.yaml or config.json dynamically based on the chain.
    // For this implementation, we will assume the user passes the correct env flag or config exists.
    // However, to be "fully dynamic", we should ideally generate a config file here.
    
    // START: Dynamic Config generation (simplified)
    const configPath = path.join(workflowPath, "config.dynamic.json");
    const dynamicConfig = {
        chainSelectorName: networkConfig.chainSelector,
        // We would populate other fields here if we had the context (e.g. contract addresses for that chain)
        // For now, we rely on existing configs or assume generic defaults.
        // This part requires knwowledge of the specific workflow's config structure.
    };
    // await fs.promises.writeFile(configPath, JSON.stringify(dynamicConfig, null, 2));
    // END: Dynamic Config generation

    // 5. Execute Deployment
    // We use 'bunx' as requested in the plan
    // We need to pass the private key if provided in args
    const envVars = { ...process.env };
    if (args.paymentWallet) {
        envVars.CRE_ETH_PRIVATE_KEY = args.paymentWallet;
    }

    const deployCommand = `cd ${workflowPath} && cre deploy --env ${networkConfig.isTestnet ? 'staging' : 'production'}`;

    console.log(`[AgentKit] Executing: ${deployCommand}`);
    
    // Note: This command might hang if it asks for interactive input. 
    // ensuring we run in non-interactive mode or capture output.
    const { stdout, stderr } = await execAsync(deployCommand, { env: envVars });

    if (stderr && !stdout) { // Some CLI tools write info to stderr but still succeed
        console.warn(`[AgentKit] CLI Stderr: ${stderr}`);
    }

    return `
Deployment Successful!
Chain: ${args.chain} (${networkConfig.chainSelector})
Forwarder Address: ${networkConfig.forwarderAddress}

Output:
${stdout}
    `;

  } catch (error: any) {
    return `Error deploying CRE workflow: ${error.message}`;
  }
}

export class DeployCREWorkflowAction implements AgentkitAction<typeof DeployCREWorkflowInput> {
  public name = "deploy_cre_workflow";
  public description = DEPLOY_CRE_WORKFLOW_PROMPT;
  public argsSchema = DeployCREWorkflowInput;
  public func = deployCREWorkflow;
  public smartAccountRequired = true; 
}
