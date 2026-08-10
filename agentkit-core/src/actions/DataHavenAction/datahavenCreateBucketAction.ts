/**
 * DataHaven Create Bucket Action
 *
 * Create a storage bucket on DataHaven decentralized storage network.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import type { AgentkitAction } from "../../agentkit";
import { validateDataHavenConfig, getDataHavenConfig } from "./datahavenConstants";
import {
  initializeDataHavenClients,
  logDataHaven,
  logDataHavenStep,
  getMspInfo,
  authenticateWithMspSdk,
  deriveBucketId,
  createBucketOnChain,
  type MspSession,
} from "./datahavenHelpers";

const CREATE_BUCKET_PROMPT = `
This tool creates a storage bucket on DataHaven decentralized storage network.

It takes the following inputs:
- bucketName: Name for the new bucket (alphanumeric, hyphens, underscores allowed)
- isPrivate: Whether the bucket should be private (default: false)

A bucket is required before uploading files. Files are organized within buckets.

IMPORTANT: Before using DataHaven actions, ensure these environment variables are set:
- USE_EOA=true
- PRIVATE_KEY=0x...
- RPC_URL=https://testnet-rpc.datahaven.xyz
- CHAIN_ID=55931
- DATAHAVEN_MSP_URL=https://testnet-msp.datahaven.xyz

Example usage:
"Create a bucket named 'my-files' on DataHaven"
`;

/**
 * Input schema for create bucket action
 */
export const DataHavenCreateBucketInput = z
  .object({
    bucketName: z
      .string()
      .min(1)
      .max(64)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Bucket name can only contain alphanumeric characters, hyphens, and underscores",
      )
      .describe("Name for the new bucket"),
    isPrivate: z
      .boolean()
      .optional()
      .nullable()
      .default(false)
      .describe("Whether the bucket should be private (default: false)"),
  })
  .strip()
  .describe("Create a storage bucket on DataHaven");

/**
 * Create a bucket on DataHaven
 */
export async function datahavenCreateBucket(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DataHavenCreateBucketInput>,
): Promise<string> {
  try {
    const startTime = Date.now();

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - CREATE BUCKET`);
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

    // Step 2: Initialize clients
    logDataHavenStep(2, "INITIALIZING CLIENTS");

    const clients = await initializeDataHavenClients();
    console.log(`[DataHaven] ✅ Wallet Address: ${clients.address}`);

    // Step 3: Get MSP info
    logDataHavenStep(3, "FETCHING MSP INFO", {
      "MSP URL": config.mspUrl,
    });

    let mspInfo;
    try {
      mspInfo = await getMspInfo(config.mspUrl);
      console.log(`[DataHaven] ✅ MSP ID: ${mspInfo.mspId}`);
      console.log(`[DataHaven]   Name: ${mspInfo.name}`);
    } catch (error) {
      console.log(`[DataHaven] ⚠️ Could not fetch MSP info - using default`);
      mspInfo = {
        mspId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        name: "Default MSP",
        multiaddresses: [],
      };
    }

    // Step 4: Authenticate with MSP
    logDataHavenStep(4, "AUTHENTICATING WITH MSP (SIWE)");

    let session: MspSession | null = null;
    try {
      session = await authenticateWithMspSdk(clients.walletClient);
      if (session) {
        console.log(`[DataHaven] ✅ Authenticated as: ${clients.address}`);
      }
    } catch (error) {
      console.log(
        `[DataHaven] ⚠️ Authentication skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log(`[DataHaven]   (Continuing with public bucket creation)`);
    }

    // Step 5: Derive bucket ID
    logDataHavenStep(5, "DERIVING BUCKET ID", {
      "Bucket Name": args.bucketName,
      Owner: clients.address,
    });

    const bucketId = deriveBucketId(clients.address, args.bucketName);
    console.log(`[DataHaven] ✅ Derived Bucket ID: ${bucketId}`);

    // Step 6: Create bucket on-chain
    logDataHavenStep(6, "CREATING BUCKET ON-CHAIN", {
      "Bucket Name": args.bucketName,
      "Is Private": args.isPrivate ? "Yes" : "No",
      "MSP ID": mspInfo.mspId,
    });

    const bucketCreationResult = await createBucketOnChain(
      clients.walletClient,
      clients.publicClient,
      args.bucketName,
      mspInfo.mspId,
      args.isPrivate || false,
    );

    if (!bucketCreationResult) {
      throw new Error("Failed to create bucket on-chain");
    }

    const { txHash } = bucketCreationResult;

    const totalTime = Date.now() - startTime;
    const timeString = `${Math.floor(totalTime / 1000)}s`;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - BUCKET CREATED (ON-CHAIN)`);
    console.log(`${"═".repeat(60)}\n`);

    // Build result
    let result = `📦 DATAHAVEN - BUCKET CREATED\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `BUCKET DETAILS\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • Bucket Name: ${args.bucketName}\n`;
    result += `  • Bucket ID: ${bucketId}\n`;
    result += `  • Owner: ${clients.address}\n`;
    result += `  • Private: ${args.isPrivate ? "Yes" : "No"}\n`;
    result += `  • MSP: ${mspInfo.name}\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `TRANSACTION\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • TX Hash: ${txHash}\n`;
    result += `  • Time: ${timeString}\n\n`;
    result += `   Run: npm install @storagehub-sdk/core @storagehub-sdk/msp-client\n`;

    return result;
  } catch (error) {
    console.log(`[DataHaven] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error creating bucket: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * DataHaven Create Bucket Action class
 */
export class DataHavenCreateBucketAction
  implements AgentkitAction<typeof DataHavenCreateBucketInput>
{
  public name = "datahaven_create_bucket";
  public description = CREATE_BUCKET_PROMPT;
  public argsSchema = DataHavenCreateBucketInput;
  public func = datahavenCreateBucket;
  public smartAccountRequired = false;
}
