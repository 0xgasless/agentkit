import { z } from "zod";
import { Account, createWalletClient, http, WalletClient } from "viem";
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
 * Extended action interface for actions that need access to the full Agentkit instance
 * (e.g., for signTypedData functionality via wallet client)
 */
export interface ExtendedAgentkitAction<TActionSchema extends ActionSchemaAny> {
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
   * The function to execute for this action - receives full Agentkit instance
   */
  func: (agentkit: Agentkit, args: z.infer<TActionSchema>) => Promise<string>;

  /**
   * Indicates this action needs the full Agentkit instance
   */
  needsFullAgentkit?: boolean;
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
  private walletClient?: WalletClient; // Store the underlying wallet client for signTypedData

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
      // const paymasterUrl = `http://localhost:3000/v1/${config.chainID}/rpc/${config.apiKey}`;

      agentkit.smartAccount = await createSmartAccountClient({
        bundlerUrl,
        paymasterUrl,
        chainId: config.chainID,
        signer: wallet,
      });

      // Store the wallet client for signTypedData functionality
      agentkit.walletClient = wallet;
    } catch (error) {
      throw new Error(`Failed to initialize smart account: ${error}`);
    }

    return agentkit;
  }

  async run<TActionSchema extends ActionSchemaAny>(
    action: AgentkitAction<TActionSchema> | ExtendedAgentkitAction<TActionSchema>,
    args: TActionSchema,
  ): Promise<string> {
    if (!this.smartAccount) {
      return `Unable to run Action: ${action.name}. A Smart Account is required. Please configure Agentkit with a Wallet to run this action.`;
    }
    
    // Check if this is an extended action that needs the full Agentkit instance
    if ('needsFullAgentkit' in action && action.needsFullAgentkit) {
      return await (
        action as ExtendedAgentkitAction<TActionSchema>
      ).func(this, args);
    } else {
      return await (
        action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
      )(this.smartAccount, args);
    }
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

  /**
   * Gets the underlying wallet client for signTypedData functionality
   * @returns {WalletClient} The underlying wallet client
   */
  getWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new Error(
        "Wallet client not configured. Call configureWithWallet() to configure the wallet client.",
      );
    }
    return this.walletClient;
  }

  /**
   * Gets the smart account from this agentkit
   * @returns {ZeroXgaslessSmartAccount} The configured smart account
   */
  getSmartAccount(): ZeroXgaslessSmartAccount {
    if (!this.smartAccount) {
      throw new Error(
        "Smart account not configured. Call configureWithWallet() to configure the smart account.",
      );
    }
    return this.smartAccount;
  }
}
