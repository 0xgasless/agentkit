import { z } from "zod";
import { Account, createPublicClient, createWalletClient, http, PublicClient } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { ZeroXgaslessSmartAccount, createSmartAccountClient } from "@0xgasless/smart-account";

import { supportedChains } from "./constants";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type ActionSchemaAny = z.ZodObject<any, any, any, any>;

/**
 * Represents the base structure for Agentkit Actions.
 */
export interface AgentkitAction<TActionSchema extends ActionSchemaAny> {
  /**
   * The name of the action
   */
  name: string;

  /**
   * A description of what the action does
   */
  description: string;

  /**
   * Schema for validating action arguments
   */
  argsSchema: TActionSchema;

  /**
   * Indicates whether a smart account is required for this action
   */
  smartAccountRequired?: boolean;

  /**
   * The function to execute for this action
   */
  func:
    | ((wallet: PublicClient, args: z.infer<TActionSchema>) => Promise<string>)
    | ((wallet: ZeroXgaslessSmartAccount, args: z.infer<TActionSchema>) => Promise<string>)
    | ((args: z.infer<TActionSchema>) => Promise<string>);
}

/**
 * Configuration options for the Agentkit
 */
export interface PublicAgentOptions {
  chainID: number;
  rpcUrl?: string;
}

/**
 * Configuration options for the Agentkit with a Smart Account
 */
export interface SmartAgentOptions extends PublicAgentOptions {
  mnemonicPhrase?: string;
  accountPath?: number;
  privateKey?: `0x${string}`;
  apiKey: string;
  cmcApiKey?: string;
}

export class Agentkit {
  private publicClient: PublicClient;
  private smartAccount?: ZeroXgaslessSmartAccount;

  /**
   * Initializes a new Agentkit instance with a public client
   *
   * @param config - Configuration options for the Agentkit
   */
  public constructor(config: PublicAgentOptions) {
    if (!supportedChains[config.chainID]) {
      throw new Error(`Chain ID ${config.chainID} is not supported`);
    }

    // Configure public client
    this.publicClient = createPublicClient({
      chain: supportedChains[config.chainID],
      transport: config.rpcUrl ? http(config.rpcUrl) : http(),
    });
  }

  /**
   * Configures Agentkit with a Smart Account for gasless transactions
   *
   * @param config - Smart agent configuration parameters
   * @returns A Promise that resolves to a new Agentkit instance
   * @throws Error if required parameters are missing or initialization fails
   */
  public static async configureWithWallet(config: SmartAgentOptions): Promise<Agentkit> {
    if (!config.apiKey || config.apiKey === "") {
      throw new Error("API_KEY is required for smart agent configuration");
    }

    const agentkit = new Agentkit(config);

    try {
      let account: Account;
      if (config.privateKey) {
        account = privateKeyToAccount(config.privateKey);
      } else if (config.mnemonicPhrase) {
        account = mnemonicToAccount(config.mnemonicPhrase, {
          accountIndex: config.accountPath || 0,
        });
      } else {
        throw new Error("Either privateKey or mnemonicPhrase must be provided");
      }

      // Create wallet client
      const wallet = createWalletClient({
        account,
        chain: supportedChains[config.chainID],
        transport: config.rpcUrl ? http(config.rpcUrl) : http(),
      });

      // Configure smart account
      const bundlerUrl = `https://bundler.0xgasless.com/${config.chainID}`;
      const paymasterUrl = `https://paymaster.0xgasless.com/v1/${config.chainID}/rpc/${config.apiKey}`;

      agentkit.smartAccount = await createSmartAccountClient({
        bundlerUrl,
        paymasterUrl,
        chainId: config.chainID,
        signer: wallet,
      });
    } catch (error) {
      throw new Error(`Failed to initialize smart account: ${error}`);
    }

    return agentkit;
  }

  /**
   * Executes an action
   *
   * @param action - The action to execute
   * @param args - Arguments for the action
   * @returns Result of the action execution
   * @throws Error if action execution fails
   */
  async run<TActionSchema extends ActionSchemaAny>(
    action: AgentkitAction<TActionSchema>,
    args: TActionSchema,
  ): Promise<string> {
    // Check function parameter count to determine execution path
    const paramCount = action.func.length;

    // For functions that only take args (no client/wallet)
    if (paramCount === 1) {
      return await (action.func as (args: TActionSchema) => Promise<string>)(args);
    }

    // For functions that require smart account
    if (paramCount > 1 && action.smartAccountRequired) {
      if (!this.smartAccount) {
        return `Unable to run Action: ${action.name}. A Smart Account is required. Please configure Agentkit with a Wallet to run this action.`;
      }
      return await (
        action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
      )(this.smartAccount, args);
    }

    return await (action.func as (client: PublicClient, args: TActionSchema) => Promise<string>)(
      this.publicClient,
      args,
    );
  }

  /**
   * Gets the smart account address if configured
   *
   * @returns The smart account address
   * @throws Error if smart account is not configured
   */
  async getAddress(): Promise<string> {
    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return await this.smartAccount.getAddress();
  }

  public async getProvider() {
    return this.smartAccount?.rpcProvider;
  }
}
