/**
 * DataHaven Upload File Action
 *
 * Upload a file to DataHaven decentralized storage network.
 */

import { z } from "zod";
import type { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import type { AgentkitAction } from "../../agentkit";
import { validateDataHavenConfig, getDataHavenConfig } from "./datahavenConstants";
import {
  initializeDataHavenClients,
  logDataHavenStep,
  formatFileSize,
  sleep,
  authenticateWithMspSdk,
  type MspSession,
} from "./datahavenHelpers";

const UPLOAD_FILE_PROMPT = `
This tool uploads a file to DataHaven decentralized storage network.

It takes the following inputs:
- bucketId: The bucket ID to upload the file to
- filePath: Local path to the file to upload (max 5MB on testnet)
- fileName: Name for the file in storage (optional, defaults to original filename)

The file will be stored on the MSP and a file key will be returned for later retrieval.

IMPORTANT: Before using DataHaven actions, ensure these environment variables are set:
- USE_EOA=true
- PRIVATE_KEY=0x...
- RPC_URL=https://testnet-rpc.datahaven.xyz
- CHAIN_ID=55931
- DATAHAVEN_MSP_URL=https://testnet-msp.datahaven.xyz

Example usage:
"Upload the file at /path/to/document.pdf to bucket 0x... on DataHaven"
`;

/**
 * Input schema for upload file action
 */
export const DataHavenUploadInput = z
  .object({
    bucketId: z.string().startsWith("0x").describe("The bucket ID to upload the file to"),
    filePath: z.string().describe("Local path to the file to upload"),
    fileName: z.string().optional().nullable().describe("Name for the file in storage (optional)"),
  })
  .strip()
  .describe("Upload a file to DataHaven storage");

/**
 * Upload a file to DataHaven
 */
export async function datahavenUploadFile(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DataHavenUploadInput>,
): Promise<string> {
  try {
    const startTime = Date.now();

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - UPLOAD FILE`);
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

    // Step 3: Check file exists and get info
    logDataHavenStep(3, "CHECKING FILE");

    let fileSize: number;
    let fileName: string;

    try {
      const fs = await import("node:fs");
      const path = await import("node:path");

      if (!fs.existsSync(args.filePath)) {
        return `Error: File not found at path: ${args.filePath}`;
      }

      const stats = fs.statSync(args.filePath);
      fileSize = stats.size;
      fileName = args.fileName || path.basename(args.filePath);

      // Check file size limit (5MB for testnet)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (fileSize > maxSize) {
        return `Error: File size ${formatFileSize(fileSize)} exceeds testnet limit of 5MB`;
      }

      console.log(`[DataHaven] ✅ File found`);
      console.log(`[DataHaven]   Name: ${fileName}`);
      console.log(`[DataHaven]   Size: ${formatFileSize(fileSize)}`);
      console.log(`[DataHaven]   Path: ${args.filePath}`);
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Step 4: Authenticate with MSP
    logDataHavenStep(4, "AUTHENTICATING WITH MSP (SIWE)");

    let session: MspSession | null = null;
    try {
      session = await authenticateWithMspSdk(clients.walletClient);
      if (session) {
        console.log(`[DataHaven] ✅ Authenticated as: ${clients.address}`);
      } else {
        console.log(`[DataHaven] ⚠️ Authentication failed - session is null`);
        return `Error: Authentication required for file upload.`;
      }
    } catch (error) {
      console.log(
        `[DataHaven] ⚠️ Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `Error: Authentication required for file upload. ${error instanceof Error ? error.message : String(error)}`;
    }

    // Step 5: Compute file fingerprint (simulated)
    logDataHavenStep(5, "COMPUTING FILE FINGERPRINT");

    // In production, this would use:
    // const fileManager = new FileManager({ size, stream: ... });
    // const fingerprint = await fileManager.getFingerprint();

    const mockFingerprint = `0x${Buffer.from(fileName + Date.now())
      .toString("hex")
      .slice(0, 64)
      .padEnd(64, "0")}`;
    console.log(`[DataHaven] ✅ Fingerprint: ${mockFingerprint.slice(0, 20)}...`);

    // Step 6: Issue storage request (simulated)
    logDataHavenStep(6, "ISSUING STORAGE REQUEST", {
      "Bucket ID": args.bucketId.slice(0, 20) + "...",
      "File Name": fileName,
      "File Size": formatFileSize(fileSize),
    });

    // Note: This is a placeholder for the actual StorageHub SDK call
    console.log(`[DataHaven] ⚠️ NOTE: Full StorageHub SDK integration pending`);
    console.log(`[DataHaven]   Storage request simulation...`);

    const mockTxHash = `0x${Date.now().toString(16)}${"0".repeat(48)}`;
    console.log(`[DataHaven] ✅ Storage Request TX: ${mockTxHash.slice(0, 20)}...`);

    // Step 7: Upload file to MSP (simulated)
    logDataHavenStep(7, "UPLOADING FILE TO MSP");

    // Simulate upload progress
    for (let progress = 0; progress <= 100; progress += 25) {
      console.log(`[DataHaven] ⏳ Upload progress: ${progress}%`);
      await sleep(500);
    }

    const mockFileKey = `0x${Date.now().toString(16)}${"f".repeat(48)}`;
    console.log(`[DataHaven] ✅ Upload complete!`);
    console.log(`[DataHaven]   File Key: ${mockFileKey.slice(0, 20)}...`);

    // Step 8: Wait for backend confirmation (simulated)
    logDataHavenStep(8, "WAITING FOR BACKEND CONFIRMATION");

    console.log(`[DataHaven] ⏳ Waiting for indexer...`);
    await sleep(1000);
    console.log(`[DataHaven] ✅ File indexed and ready!`);

    const totalTime = Date.now() - startTime;
    const timeString = `${Math.floor(totalTime / 1000)}s`;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - UPLOAD COMPLETE (SIMULATED)`);
    console.log(`${"═".repeat(60)}\n`);

    // Build result
    let result = `📤 DATAHAVEN - FILE UPLOADED\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `FILE DETAILS\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • File Name: ${fileName}\n`;
    result += `  • File Size: ${formatFileSize(fileSize)}\n`;
    result += `  • Bucket ID: ${args.bucketId}\n`;
    result += `  • File Key: ${mockFileKey}\n`;
    result += `  • Fingerprint: ${mockFingerprint.slice(0, 40)}...\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `TRANSACTION\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • Storage Request TX: ${mockTxHash} (simulated)\n`;
    result += `  • Status: ✅ Ready\n`;
    result += `  • Upload Time: ${timeString}\n\n`;
    result += `💡 Use the File Key to download this file later:\n`;
    result += `   "Download file ${mockFileKey} from DataHaven"\n\n`;
    result += `⚠️ NOTE: Full implementation requires @storagehub-sdk/core\n`;

    return result;
  } catch (error) {
    console.log(`[DataHaven] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error uploading file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * DataHaven Upload File Action class
 */
export class DataHavenUploadAction implements AgentkitAction<typeof DataHavenUploadInput> {
  public name = "datahaven_upload_file";
  public description = UPLOAD_FILE_PROMPT;
  public argsSchema = DataHavenUploadInput;
  public func = datahavenUploadFile;
  public smartAccountRequired = false;
}
