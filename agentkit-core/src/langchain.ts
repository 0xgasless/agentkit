import {
  StructuredToolInterface,
  BaseToolkit as Toolkit,
  StructuredTool,
} from "@langchain/core/tools";
import { AGENTKIT_ACTIONS } from "./actions";
import { Agentkit, AgentkitAction } from "./agentkit";
import { z } from "zod";

/**
 * 0xgasless Agentkit Toolkit.
 *
 * Security Note: This toolkit contains tools that can perform gasless
 * transactions on supported EVM chains using account abstraction.
 * Tools can read and modify blockchain state through operations like
 * token transfers, swaps, and smart contract deployments.
 *
 * Setup:
 * You will need to configure the following:
 * ```typescript
 * const config = {
 *   chainID: 8453, // Base chain ID
 *   apiKey: "your-0xgasless-api-key",
 *   privateKey: "0x..." // or mnemonicPhrase: "..."
 * };
 * const agentkit = await Agentkit.configureWithWallet(config);
 * const toolkit = new AgentkitToolkit(agentkit);
 * const tools = toolkit.getTools();
 * ```
 *
 * Important: Once configured, the wallet is ready to use with all tools.
 * No additional wallet setup or private key generation is needed when using the tools.
 *
 * Available tools include:
 * - get_balance: Check ETH and token balances (uses the already configured wallet)
 * - smart_transfer: Transfer tokens gaslessly
 * - swap: Perform token swaps without gas fees
 * - deploy_token: Deploy new ERC20 tokens
 *
 * Supported Networks:
 * - Base (8453)
 * - Sonic (156)
 * - Moonbeam (1284)
 * - Avalanche (43114)
 * - Avalanche Fuji (43113)
 * - BSC (56)
 */
export class AgentkitToolkit extends Toolkit {
  tools: StructuredToolInterface[];

  /**
   * Creates a new 0xgasless Toolkit instance
   *
   * @param agentkit - 0xgasless agentkit instance
   */
  constructor(agentkit: Agentkit) {
    super();
    this.tools = AGENTKIT_ACTIONS.map(action => new AgentkitTool(action, agentkit));
  }

  getTools(): StructuredToolInterface[] {
    return this.tools;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ActionSchemaAny = z.ZodObject<any, any, any, any>;

/**
 * This tool allows agents to interact with the 0xgasless library and control an MPC Wallet onchain.
 *
 * To use this tool, you must first set as environment variables:
 * ```bash
 * Required:
 * export 0xGASLESS_API_KEY="your-0xgasless-api-key"
 * export 0xGASLESS_CHAIN_ID="your-0xgasless-chain-id"
 * export 0xGASLESS_PRIVATE_KEY="your-0xgasless-private-key"
 *
 * Optional:
 * export 0xGASLESS_MNEMONIC_PHRASE="your-0xgasless-mnemonic-phrase"
 * export 0xGASLESS_RPC_URL="your-0xgasless-rpc-url"
 * ```
 */

export class AgentkitTool<TActionSchema extends ActionSchemaAny> extends StructuredTool {
  /**
   * Schema definition for the tool's input
   */
  public schema: TActionSchema;

  /**
   * The name of the tool
   */
  public name: string;

  /**
   * The description of the tool
   */
  public description: string;

  /**
   * The Agentkit instance
   */
  private agentkit: Agentkit;

  /**
   * The Agentkit Action
   */
  private action: AgentkitAction<TActionSchema>;

  /**
   * Constructor for the Agentkit Tool class
   *
   * @param action - The Agentkit action to execute
   * @param agentkit - The Agentkit wrapper to use
   */
  constructor(action: AgentkitAction<TActionSchema>, agentkit: Agentkit) {
    super();
    this.action = action;
    this.agentkit = agentkit;
    this.name = action.name;
    this.description = action.description;
    this.schema = action.argsSchema;
  }

  /**
   * Executes the Agentkit action with the provided input
   *
   * @param input - An object containing either instructions or schema-validated arguments
   * @returns A promise that resolves to the result of the Agentkit action
   * @throws {Error} If the Agentkit action fails
   */
  protected async _call(
    input: z.infer<typeof this.schema> & Record<string, unknown>,
  ): Promise<string> {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      let args: any;

      // If we have a schema, try to validate against it
      if (this.schema) {
        try {
          const validatedInput = this.schema.parse(input);
          args = validatedInput;
        } catch (error) {
          // If schema validation fails, fall back to instructions-only mode
          args = input;
          console.error(`Error validating input for ${this.name}: ${error}`);
        }
      }
      // No schema, use instructions mode
      else {
        args = input;
      }

      return await this.agentkit.run(this.action, args);
    } catch (error: unknown) {
      if (error instanceof Error) {
        return `Error executing ${this.name}: ${error.message}`;
      }
      return `Error executing ${this.name}: Unknown error occurred`;
    }
  }
}
