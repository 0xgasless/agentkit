import { z } from "zod";
import { Account, createWalletClient, http } from "viem";
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
  func: (wallet: ZeroXgaslessSmartAccount, args: z.infer<TActionSchema>) => Promise<string>;
  // | ((wallet: PublicClient, args: z.infer<TActionSchema>) => Promise<string>)
  // | ((args: z.infer<TActionSchema>) => Promise<string>);
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
}

export class Agentkit {
  private smartAccount?: ZeroXgaslessSmartAccount;
  private serverMode: boolean = false;
  private apiKey?: string;
  private serverUrl?: string;
  private selectedWalletIndex: number = 0;

  public constructor(config: PublicAgentOptions) {
    if (!supportedChains[config.chainID]) {
      throw new Error(`Chain ID ${config.chainID} is not supported`);
    }
  }

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

  public static async configureWithServer(config: {
    apiKey: string;
    chainID: number;
    serverUrl?: string;
  }): Promise<Agentkit> {
    if (!config.apiKey || config.apiKey === "") {
      throw new Error("API_KEY is required for server configuration");
    }

    const agentkit = new Agentkit({ chainID: config.chainID });
    agentkit.serverMode = true;
    agentkit.apiKey = config.apiKey;
    agentkit.serverUrl = config.serverUrl || "https://api.0xgasless.com";
    agentkit.selectedWalletIndex = 0; // Default to wallet index 0

    return agentkit;
  }

  public static async configureWithAPIKey(apiKey: string): Promise<Agentkit> {
    if (!apiKey || apiKey === "") {
      throw new Error("API_KEY is required for smart agent configuration");
    }

    const agentkit = new Agentkit({
      chainID: 1,
    });
    return agentkit;
  }

  async run<TActionSchema extends ActionSchemaAny>(
    action: AgentkitAction<TActionSchema>,
    args: TActionSchema,
  ): Promise<string> {
    if (!this.smartAccount && !this.serverMode) {
      return `Unable to run Action: ${action.name}. A Smart Account is required. Please configure Agentkit with a Wallet to run this action.`;
    }
    
    // Pass the agentkit instance for server mode actions
    if (this.serverMode) {
      // For server mode, we pass the Agentkit instance instead of a smart account
      // The action's func will need to handle both types
      return await action.func(this as unknown as ZeroXgaslessSmartAccount, args);
    }
    
    return await (
      action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
    )(this.smartAccount!, args);
  }

  async getAddress(): Promise<string> {
    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return await this.smartAccount.getAddress();
  }

  async getChainId(): Promise<number> {
    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return this.smartAccount.SmartAccountConfig.chainId;
  }

  // New getters for server mode
  isServerMode(): boolean {
    return this.serverMode;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getServerUrl(): string | undefined {
    return this.serverUrl;
  }

  getSelectedWalletIndex(): number {
    return this.selectedWalletIndex;
  }

  setSelectedWalletIndex(index: number): void {
    this.selectedWalletIndex = index;
  }
}
