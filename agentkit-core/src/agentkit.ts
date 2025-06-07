import { z } from "zod";
import { Account, createWalletClient, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { ZeroXgaslessSmartAccount, createSmartAccountClient } from "@0xgasless/smart-account";

import { supportedChains } from "./constants";
import { verifyApiKey, type AuthVerificationResponse } from "./services/authService";

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
  private apiKey?: string;

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

  /**
   * Configure Agentkit with just an API key - wallet info will be fetched from server
   */
  public static async configureAgentkit(apiKey: string): Promise<Agentkit> {
    if (!apiKey || apiKey === "") {
      throw new Error("API key is required");
    }

    // Create instance with default Avalanche C-Chain configuration
    const agentkit = new Agentkit({ chainID: 43114 });
    agentkit.apiKey = apiKey;

    try {
      // Verify API key and get wallet info from internal service
      const walletData = await agentkit.verifyApiKeyInternal(apiKey);
      
      // Create account from private key
      const account = privateKeyToAccount(walletData.privateKey);

      // Create wallet client
      const wallet = createWalletClient({
        account,
        chain: supportedChains[walletData.chainId],
        transport: walletData.rpcUrl ? http(walletData.rpcUrl) : http(),
      });

      // Configure smart account
      const bundlerUrl = `https://bundler.0xgasless.com/${walletData.chainId}`;
      const paymasterUrl = `https://paymaster.0xgasless.com/v1/${walletData.chainId}/rpc/${apiKey}`;

      agentkit.smartAccount = await createSmartAccountClient({
        bundlerUrl,
        paymasterUrl,
        chainId: walletData.chainId,
        signer: wallet,
      });

      return agentkit;
    } catch (error) {
      throw new Error(`Failed to configure Agentkit: ${error}`);
    }
  }

  /**
   * Verify API key using internal auth service
   */
  private async verifyApiKeyInternal(apiKey: string): Promise<NonNullable<AuthVerificationResponse['data']>> {
    try {
      const result = await verifyApiKey(apiKey);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'API key verification failed');
      }

      return result.data;
    } catch (error) {
      throw new Error(`API key verification failed: ${error}`);
    }
  }

  async run<TActionSchema extends ActionSchemaAny>(
    action: AgentkitAction<TActionSchema>,
    args: TActionSchema,
  ): Promise<string> {
    // Revalidate API key if this instance was created with configureAgentkit
    if (this.apiKey) {
      try {
        await this.revalidateAndReconfigure();
      } catch (error) {
        return `Unable to run Action: ${action.name}. API key validation failed: ${error}`;
      }
    }

    if (!this.smartAccount) {
      return `Unable to run Action: ${action.name}. A Smart Account is required. Please configure Agentkit with a Wallet to run this action.`;
    }
    
    try {
      return await (
        action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
      )(this.smartAccount, args);
    } catch (error) {
      return `Action ${action.name} failed: ${error}`;
    }
  }

  async getAddress(): Promise<string> {
    // Revalidate API key if this instance was created with configureAgentkit
    if (this.apiKey) {
      try {
        await this.revalidateAndReconfigure();
      } catch (error) {
        throw new Error(`Cannot get address: API key validation failed: ${error}`);
      }
    }

    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return await this.smartAccount.getAddress();
  }

  async getChainId(): Promise<number> {
    // Revalidate API key if this instance was created with configureAgentkit
    if (this.apiKey) {
      try {
        await this.revalidateAndReconfigure();
      } catch (error) {
        throw new Error(`Cannot get chain ID: API key validation failed: ${error}`);
      }
    }

    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return this.smartAccount.SmartAccountConfig.chainId;
  }

  /**
   * Revalidate API key and reconfigure smart account
   */
  private async revalidateAndReconfigure(): Promise<void> {
    if (!this.apiKey) {
      throw new Error("No API key to revalidate");
    }

    try {
      // Verify API key and get wallet info from internal service
      const walletData = await this.verifyApiKeyInternal(this.apiKey);
      
      // Create account from private key
      const account = privateKeyToAccount(walletData.privateKey);

      // Create wallet client
      const wallet = createWalletClient({
        account,
        chain: supportedChains[walletData.chainId],
        transport: walletData.rpcUrl ? http(walletData.rpcUrl) : http(),
      });

      // Configure smart account
      const bundlerUrl = `https://bundler.0xgasless.com/${walletData.chainId}`;
      const paymasterUrl = `https://paymaster.0xgasless.com/v1/${walletData.chainId}/rpc/${this.apiKey}`;

      this.smartAccount = await createSmartAccountClient({
        bundlerUrl,
        paymasterUrl,
        chainId: walletData.chainId,
        signer: wallet,
      });
    } catch (error) {
      throw new Error(`Revalidation failed: ${error}`);
    }
  }
}
