/**
 * DataHaven Info Action
 *
 * Get DataHaven MSP health status and configuration info.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import type { AgentkitAction } from "../../agentkit";
import {
  validateDataHavenConfig,
  getDataHavenConfig,
  DATAHAVEN_TESTNET_CONFIG,
} from "./datahavenConstants";
import { getMspHealth, getMspInfo, logDataHaven, logDataHavenStep } from "./datahavenHelpers";

const DATAHAVEN_INFO_PROMPT = `
This tool retrieves information about DataHaven decentralized storage network.

It can show:
- MSP (Main Storage Provider) health status
- Network configuration
- Current chain and RPC settings

No inputs required - just call the action to get DataHaven info.

IMPORTANT: Before using DataHaven actions, ensure these environment variables are set:
- USE_EOA=true
- PRIVATE_KEY=0x...
- RPC_URL=https://testnet-rpc.datahaven.xyz
- CHAIN_ID=55931
- DATAHAVEN_MSP_URL=https://testnet-msp.datahaven.xyz
`;

/**
 * Input schema for DataHaven info action
 */
export const DataHavenInfoInput = z
  .object({
    showHealth: z
      .boolean()
      .optional()
      .nullable()
      .default(true)
      .describe("Whether to show MSP health status"),
  })
  .strip()
  .describe("Get DataHaven network and MSP information");

/**
 * Get DataHaven info
 */
export async function datahavenInfo(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DataHavenInfoInput>,
): Promise<string> {
  try {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN STORAGE - INFO`);
    console.log(`${"═".repeat(60)}\n`);

    // Step 1: Validate configuration
    logDataHavenStep(1, "CHECKING CONFIGURATION");

    const configError = validateDataHavenConfig();
    if (configError) {
      console.log(`[DataHaven] ❌ Configuration missing`);
      return configError;
    }

    console.log(`[DataHaven] ✅ Configuration valid`);

    const config = getDataHavenConfig();

    // Step 2: Show network config
    logDataHavenStep(2, "NETWORK CONFIGURATION", {
      "Chain ID": config.chainId,
      "RPC URL": config.rpcUrl,
      "MSP URL": config.mspUrl,
      "EOA Mode": config.useEoa ? "Enabled" : "Disabled",
    });

    // Step 3: Get MSP health if requested
    let healthInfo: Awaited<ReturnType<typeof getMspHealth>> | null = null;
    let mspInfo: Awaited<ReturnType<typeof getMspInfo>> | null = null;

    if (args.showHealth) {
      logDataHavenStep(3, "CHECKING MSP HEALTH");

      try {
        healthInfo = await getMspHealth(config.mspUrl);
        console.log(`[DataHaven] ✅ MSP Status: ${healthInfo.status}`);
        console.log(`[DataHaven]   Version: ${healthInfo.version}`);
        console.log(`[DataHaven]   Service: ${healthInfo.service}`);

        if (healthInfo.components) {
          for (const [comp, info] of Object.entries(healthInfo.components)) {
            console.log(`[DataHaven]   ${comp}: ${info.status}`);
          }
        }
      } catch (error) {
        console.log(
          `[DataHaven] ⚠️ Could not fetch MSP health: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      try {
        mspInfo = await getMspInfo(config.mspUrl);
        console.log(`[DataHaven] ✅ MSP Info retrieved`);
        console.log(`[DataHaven]   MSP ID: ${mspInfo.mspId}`);
        console.log(`[DataHaven]   Name: ${mspInfo.name}`);
      } catch (error) {
        console.log(
          `[DataHaven] ⚠️ Could not fetch MSP info: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN INFO - COMPLETE`);
    console.log(`${"═".repeat(60)}\n`);

    // Build result
    let result = `📦 DATAHAVEN STORAGE INFO\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `NETWORK CONFIGURATION\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • Chain: DataHaven Testnet\n`;
    result += `  • Chain ID: ${config.chainId}\n`;
    result += `  • RPC: ${config.rpcUrl}\n`;
    result += `  • MSP: ${config.mspUrl}\n`;
    result += `  • Mode: ${config.useEoa ? "EOA (Testnet)" : "Smart Account"}\n\n`;

    if (healthInfo) {
      result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      result += `MSP HEALTH STATUS\n`;
      result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      result += `  • Status: ${healthInfo.status === "healthy" ? "✅ Healthy" : "⚠️ " + healthInfo.status}\n`;
      result += `  • Version: ${healthInfo.version}\n`;
      result += `  • Service: ${healthInfo.service}\n`;

      if (healthInfo.components) {
        result += `\n  Components:\n`;
        for (const [comp, info] of Object.entries(healthInfo.components)) {
          const icon = info.status === "healthy" ? "✅" : "⚠️";
          result += `    ${icon} ${comp}: ${info.status}\n`;
        }
      }
    }

    if (mspInfo) {
      result += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      result += `MSP DETAILS\n`;
      result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      result += `  • MSP ID: ${mspInfo.mspId}\n`;
      result += `  • Name: ${mspInfo.name}\n`;
      if (mspInfo.multiaddresses?.length > 0) {
        result += `  • Addresses: ${mspInfo.multiaddresses.length} available\n`;
      }
    }

    return result;
  } catch (error) {
    console.log(`[DataHaven] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error getting DataHaven info: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * DataHaven Info Action class
 */
export class DataHavenInfoAction implements AgentkitAction<typeof DataHavenInfoInput> {
  public name = "datahaven_info";
  public description = DATAHAVEN_INFO_PROMPT;
  public argsSchema = DataHavenInfoInput;
  public func = datahavenInfo;
  public smartAccountRequired = false;
}
