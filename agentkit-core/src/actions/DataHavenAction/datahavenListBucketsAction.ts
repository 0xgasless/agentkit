/**
 * DataHaven List Buckets Action
 * 
 * List all storage buckets for the authenticated user on DataHaven.
 * Uses StorageHub SDK for real bucket listing.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import type { AgentkitAction } from "../../agentkit";
import { validateDataHavenConfig, getDataHavenConfig, type BucketInfo } from "./datahavenConstants";
import { 
  initializeDataHavenClients, 
  initializeMspClient,
  authenticateWithMspSdk,
  logDataHavenStep,
  logDataHaven,
  formatFileSize,
} from "./datahavenHelpers";

const LIST_BUCKETS_PROMPT = `
This tool lists all storage buckets owned by the authenticated user on DataHaven.

No inputs required - just call the action to see all your buckets.

Returns:
- List of buckets with their IDs, names, sizes, and file counts

IMPORTANT: Before using DataHaven actions, ensure these environment variables are set:
- USE_EOA=true
- PRIVATE_KEY=0x...
- RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
- CHAIN_ID=43113
- DATAHAVEN_RPC_URL=https://services.datahaven-testnet.network/testnet
- DATAHAVEN_MSP_URL=https://deo-dh-backend.testnet.datahaven-infra.network/

Example usage:
"List all my buckets on DataHaven"
`;

/**
 * Input schema for list buckets action
 */
export const DataHavenListBucketsInput = z
  .object({})
  .strip()
  .describe("List all storage buckets for the authenticated user");

/**
 * List buckets on DataHaven
 */
export async function datahavenListBuckets(
  wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof DataHavenListBucketsInput>,
): Promise<string> {
  try {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - LIST BUCKETS`);
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

    // Step 3: Initialize MSP Client
    logDataHavenStep(3, "CONNECTING TO MSP");
    
    const mspClient = await initializeMspClient();
    if (!mspClient) {
      logDataHaven("⚠️ MSP Client not available - using mock data");
      return getMockBucketsResult();
    }
    console.log(`[DataHaven] ✅ MSP Client connected`);

    // Step 4: Authenticate with SIWE
    logDataHavenStep(4, "AUTHENTICATING WITH MSP (SIWE)");
    
    const session = await authenticateWithMspSdk(clients.walletClient);
    if (!session) {
      logDataHaven("⚠️ Authentication failed - using mock data");
      return getMockBucketsResult();
    }
    console.log(`[DataHaven] ✅ Authenticated as: ${session.user.address}`);

    // Step 5: List buckets
    logDataHavenStep(5, "FETCHING BUCKETS");
    
    let buckets: any[];
    try {
      buckets = await mspClient.buckets.listBuckets();
      console.log(`[DataHaven] ✅ Found ${buckets.length} buckets`);
    } catch (error) {
      logDataHaven(`⚠️ Failed to list buckets: ${error instanceof Error ? error.message : String(error)}`);
      return getMockBucketsResult();
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - LIST COMPLETE`);
    console.log(`${"═".repeat(60)}\n`);

    // Build result
    let result = `📂 DATAHAVEN - YOUR BUCKETS\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `BUCKETS (${buckets.length} total)\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (buckets.length === 0) {
      result += `  No buckets found. Create one with:\n`;
      result += `  "Create a bucket named 'my-bucket' on DataHaven"\n\n`;
    } else {
      for (const bucket of buckets) {
        const visibility = bucket.isPublic ? "🌍 Public" : "🔒 Private";
        const size = bucket.sizeBytes || bucket.size || 0;
        const fileCount = bucket.fileCount || 0;
        
        result += `┌─────────────────────────────────────────────────\n`;
        result += `│ 📁 ${bucket.name || "Unnamed"}  ${visibility}\n`;
        result += `├─────────────────────────────────────────────────\n`;
        result += `│ ID: ${bucket.bucketId?.slice(0, 20) || "N/A"}...\n`;
        result += `│ Files: ${fileCount}\n`;
        result += `│ Size: ${formatFileSize(Number(size))}\n`;
        result += `└─────────────────────────────────────────────────\n\n`;
      }
    }

    // Calculate totals
    const totalFiles = buckets.reduce((sum, b) => sum + (b.fileCount || 0), 0);
    const totalSize = buckets.reduce((sum, b) => sum + Number(b.sizeBytes || b.size || 0), 0);

    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `SUMMARY\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • Total Buckets: ${buckets.length}\n`;
    result += `  • Total Files: ${totalFiles}\n`;
    result += `  • Total Storage: ${formatFileSize(totalSize)}\n`;

    return result;
  } catch (error) {
    console.log(`[DataHaven] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error listing buckets: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get mock buckets result for when SDK is not available
 */
function getMockBucketsResult(): string {
  const mockBuckets: BucketInfo[] = [
    {
      bucketId: `0x${"a".repeat(64)}`,
      name: "default-bucket",
      root: `0x${"0".repeat(64)}`,
      isPublic: true,
      sizeBytes: 1024 * 1024 * 5,
      valuePropId: `0x${"b".repeat(64)}`,
      fileCount: 12,
    },
    {
      bucketId: `0x${"c".repeat(64)}`,
      name: "private-docs",
      root: `0x${"0".repeat(64)}`,
      isPublic: false,
      sizeBytes: 1024 * 512,
      valuePropId: `0x${"d".repeat(64)}`,
      fileCount: 3,
    },
  ];

  let result = `📂 DATAHAVEN - YOUR BUCKETS (SIMULATED)\n\n`;
  result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  result += `BUCKETS (${mockBuckets.length} total)\n`;
  result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const bucket of mockBuckets) {
    const visibility = bucket.isPublic ? "🌍 Public" : "🔒 Private";
    result += `┌─────────────────────────────────────────────────\n`;
    result += `│ 📁 ${bucket.name}  ${visibility}\n`;
    result += `├─────────────────────────────────────────────────\n`;
    result += `│ ID: ${bucket.bucketId.slice(0, 20)}...\n`;
    result += `│ Files: ${bucket.fileCount}\n`;
    result += `│ Size: ${formatFileSize(bucket.sizeBytes)}\n`;
    result += `└─────────────────────────────────────────────────\n\n`;
  }

  result += `⚠️ NOTE: This is simulated data. SIWE authentication required for real data.\n`;

  return result;
}

/**
 * DataHaven List Buckets Action class
 */
export class DataHavenListBucketsAction implements AgentkitAction<typeof DataHavenListBucketsInput> {
  public name = "datahaven_list_buckets";
  public description = LIST_BUCKETS_PROMPT;
  public argsSchema = DataHavenListBucketsInput;
  public func = datahavenListBuckets;
  public smartAccountRequired = false;
}
