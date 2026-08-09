import { z } from "zod";
import { Account, createWalletClient, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { ZeroXgaslessSmartAccount, createSmartAccountClient } from "@0xgasless/smart-account-sdk";
import { OxGasAgent } from "@0xgasless/agent";
import type { Chain as PlatformChain } from "@0xgasless/agent";

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
   * True for actions whose implementation never touches the wallet (pure HTTP /
   * pure computation). These run in ANY mode — platform, self-custody, or even
   * unconfigured — the wallet argument is simply not used.
   */
  walletOptional?: boolean;

  /**
   * The function to execute for this action (self-custody / smart-account mode).
   */
  func: (wallet: ZeroXgaslessSmartAccount, args: z.infer<TActionSchema>) => Promise<string>;

  /**
   * Platform-mode implementation (KMS-custodied wallet via the 0xGasless agent
   * platform). When Agentkit is configured with `configureWithPlatform`, actions
   * that provide this run against the platform; actions that don't will explain
   * they need self-custody mode.
   */
  platformFunc?: (
    client: OxGasAgent,
    agentId: string,
    args: z.infer<TActionSchema>,
  ) => Promise<string>;
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
 * (self-custody mode — the key stays on your machine).
 */
export interface SmartAgentOptions extends PublicAgentOptions {
  mnemonicPhrase?: string;
  accountPath?: number;
  privateKey?: `0x${string}`;
  apiKey: string;
  /**
   * The `run_terminal_command` action executes arbitrary shell commands and is
   * DISABLED unless this is explicitly set to true. Only enable it in sandboxed
   * environments you fully control.
   */
  unsafeTerminalAccess?: boolean;
}

/**
 * Configuration options for platform mode — the agent's wallet lives in the
 * 0xGasless platform (AWS KMS custody). Your code never sees a private key;
 * the dashboard API key authenticates every action, and server-side spending
 * policy gates every payment.
 */
export interface PlatformAgentOptions {
  /** Dashboard API key (Project → Auth → API Key). */
  apiKey: string;
  /** The platform agent whose wallet this Agentkit instance drives. */
  agentId: string;
  /** Default chain for actions that don't specify one (e.g. 'avalanche-fuji'). */
  chain?: PlatformChain;
  /** Override the platform API URL (rarely needed). */
  apiUrl?: string;
  /** Override the facilitator URL (rarely needed). */
  facilitatorUrl?: string;
  /** Custom fetch (mainly for testing). */
  fetch?: typeof globalThis.fetch;
  /** See SmartAgentOptions.unsafeTerminalAccess. */
  unsafeTerminalAccess?: boolean;
}

const UNSAFE_TERMINAL_ACTION = "run_terminal_command";

export class Agentkit {
  private smartAccount?: ZeroXgaslessSmartAccount;
  private platform?: { client: OxGasAgent; agentId: string; chain?: PlatformChain };
  private unsafeTerminalAccess = false;

  public constructor(config?: PublicAgentOptions) {
    if (config && !supportedChains[config.chainID]) {
      throw new Error(`Chain ID ${config.chainID} is not supported`);
    }
  }

  /**
   * Configure Agentkit in self-custody mode: a local private key / mnemonic
   * signs through an ERC-4337 smart account, gas sponsored by the 0xGasless
   * paymaster.
   */
  public static async configureWithWallet(config: SmartAgentOptions): Promise<Agentkit> {
    if (!config.apiKey || config.apiKey === "") {
      throw new Error("API_KEY is required for smart agent configuration");
    }

    const agentkit = new Agentkit(config);
    agentkit.unsafeTerminalAccess = config.unsafeTerminalAccess === true;

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
   * Configure Agentkit in platform mode: the wallet is a KMS-custodied
   * 0xGasless platform agent. No private key ever touches this process.
   *
   *     const agentkit = await Agentkit.configureWithPlatform({
   *       apiKey: process.env.OXGAS_API_KEY!,
   *       agentId: "my-bot",
   *       chain: "avalanche-fuji",
   *     });
   */
  public static async configureWithPlatform(config: PlatformAgentOptions): Promise<Agentkit> {
    if (!config.apiKey) {
      throw new Error("apiKey is required — create one in the 0xGasless dashboard");
    }
    if (!config.agentId) {
      throw new Error("agentId is required — create an agent first (client.agents.create)");
    }

    const agentkit = new Agentkit();
    agentkit.unsafeTerminalAccess = config.unsafeTerminalAccess === true;
    const client = new OxGasAgent({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      facilitatorUrl: config.facilitatorUrl,
      fetch: config.fetch,
    });
    // Fail fast on a bad apiKey/agentId instead of at first action.
    await client.agents.get(config.agentId);
    agentkit.platform = { client, agentId: config.agentId, chain: config.chain };
    return agentkit;
  }

  /** True when running in platform (KMS custody) mode. */
  public isPlatformMode(): boolean {
    return this.platform !== undefined;
  }

  /** The platform client + agentId (platform mode only) — for advanced callers. */
  public getPlatform(): { client: OxGasAgent; agentId: string; chain?: PlatformChain } {
    if (!this.platform) {
      throw new Error("Not in platform mode — configure with Agentkit.configureWithPlatform()");
    }
    return this.platform;
  }

  /** Whether the unsafe terminal action was explicitly enabled. */
  public allowsUnsafeTerminal(): boolean {
    return this.unsafeTerminalAccess;
  }

  async run<TActionSchema extends ActionSchemaAny>(
    action: AgentkitAction<TActionSchema>,
    args: TActionSchema,
  ): Promise<string> {
    if (action.name === UNSAFE_TERMINAL_ACTION && !this.unsafeTerminalAccess) {
      return (
        `Action ${action.name} is disabled. It executes arbitrary shell commands, ` +
        `so it must be explicitly enabled with { unsafeTerminalAccess: true } in the ` +
        `Agentkit configuration — only do that in a sandboxed environment.`
      );
    }
    if (this.platform) {
      if (action.platformFunc) {
        return await action.platformFunc(this.platform.client, this.platform.agentId, args);
      }
      if (action.walletOptional) {
        return await (
          action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
        )(undefined as unknown as ZeroXgaslessSmartAccount, args);
      }
      return (
        `Action ${action.name} is not available in platform mode yet. ` +
        `It requires self-custody mode (Agentkit.configureWithWallet).`
      );
    }
    if (!this.smartAccount) {
      if (action.walletOptional) {
        return await (
          action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
        )(undefined as unknown as ZeroXgaslessSmartAccount, args);
      }
      return `Unable to run Action: ${action.name}. A Smart Account is required. Please configure Agentkit with a Wallet to run this action.`;
    }
    return await (
      action.func as (account: ZeroXgaslessSmartAccount, args: TActionSchema) => Promise<string>
    )(this.smartAccount, args);
  }

  async getAddress(): Promise<string> {
    if (this.platform) {
      const agent = await this.platform.client.agents.get(this.platform.agentId);
      return agent.address;
    }
    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return await this.smartAccount.getAddress();
  }

  async getChainId(): Promise<number> {
    if (this.platform) {
      const chain = this.platform.chain;
      if (chain === "avalanche") return 43114;
      if (chain === "avalanche-fuji" || chain === "fuji") return 43113;
      if (chain === "base") return 8453;
      throw new Error(`Platform chain ${chain ?? "(agent default)"} has no numeric EVM chain ID here`);
    }
    if (!this.smartAccount) {
      throw new Error("Smart account not configured");
    }
    return this.smartAccount.SmartAccountConfig.chainId;
  }
}
