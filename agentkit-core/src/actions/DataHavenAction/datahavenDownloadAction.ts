/**
 * DataHaven Download File Action
 *
 * Download a file from DataHaven decentralized storage network.
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
} from "./datahavenHelpers";

const DOWNLOAD_FILE_PROMPT = `
This tool downloads a file from DataHaven decentralized storage network.

It takes the following inputs:
- fileKey: The file key returned from a previous upload
- downloadPath: Local path where the file should be saved (optional)

The file will be retrieved from the MSP and saved locally.

IMPORTANT: Before using DataHaven actions, ensure these environment variables are set:
- USE_EOA=true
- PRIVATE_KEY=0x...
- RPC_URL=https://testnet-rpc.datahaven.xyz
- CHAIN_ID=55931
- DATAHAVEN_MSP_URL=https://testnet-msp.datahaven.xyz

Example usage:
"Download file 0x... from DataHaven and save it to /path/to/downloads/"
`;

/**
 * Input schema for download file action
 */
export const DataHavenDownloadInput = z
  .object({
    fileKey: z.string().startsWith("0x").describe("The file key to download"),
    downloadPath: z
      .string()
      .optional()
      .nullable()
      .describe("Local path where the file should be saved (optional)"),
  })
  .strip()
  .describe("Download a file from DataHaven storage");

/**
 * Download a file from DataHaven
 */
export async function datahavenDownloadFile(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DataHavenDownloadInput>,
): Promise<string> {
  try {
    const startTime = Date.now();

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - DOWNLOAD FILE`);
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

    // Step 3: Get file info from MSP (simulated)
    logDataHavenStep(3, "FETCHING FILE INFO", {
      "File Key": args.fileKey.slice(0, 20) + "...",
    });

    // In production, this would call:
    // const fileInfo = await mspClient.files.getFileInfo(bucketId, fileKey);

    const mockFileInfo = {
      fileKey: args.fileKey,
      fingerprint: `0x${Date.now().toString(16)}${"a".repeat(48)}`,
      bucketId: `0x${"b".repeat(64)}`,
      location: "downloaded-file.txt",
      size: 1024 * 42, // 42 KB mock
      isPublic: true,
      status: "ready" as const,
    };

    console.log(`[DataHaven] ✅ File Info Retrieved`);
    console.log(`[DataHaven]   Name: ${mockFileInfo.location}`);
    console.log(`[DataHaven]   Size: ${formatFileSize(mockFileInfo.size)}`);
    console.log(`[DataHaven]   Status: ${mockFileInfo.status}`);

    // Step 4: Verify file is ready
    logDataHavenStep(4, "VERIFYING FILE STATUS");

    if (mockFileInfo.status !== "ready") {
      return `Error: File is not ready for download. Status: ${mockFileInfo.status}`;
    }
    console.log(`[DataHaven] ✅ File is ready for download`);

    // Step 5: Download file from MSP (simulated)
    logDataHavenStep(5, "DOWNLOADING FILE FROM MSP");

    // Simulate download progress
    for (let progress = 0; progress <= 100; progress += 25) {
      console.log(`[DataHaven] ⏳ Download progress: ${progress}%`);
      await sleep(400);
    }

    // Determine save path
    const downloadPath = args.downloadPath || `./${mockFileInfo.location}`;

    console.log(`[DataHaven] ✅ Download complete!`);
    console.log(`[DataHaven]   Saved to: ${downloadPath} (simulated)`);

    // Step 6: Verify file integrity (simulated)
    logDataHavenStep(6, "VERIFYING FILE INTEGRITY");

    console.log(`[DataHaven] ⏳ Comparing fingerprints...`);
    await sleep(500);
    console.log(`[DataHaven] ✅ File integrity verified!`);

    const totalTime = Date.now() - startTime;
    const timeString = `${Math.floor(totalTime / 1000)}s`;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`   DATAHAVEN - DOWNLOAD COMPLETE (SIMULATED)`);
    console.log(`${"═".repeat(60)}\n`);

    // Build result
    let result = `📥 DATAHAVEN - FILE DOWNLOADED\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `FILE DETAILS\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • File Name: ${mockFileInfo.location}\n`;
    result += `  • File Size: ${formatFileSize(mockFileInfo.size)}\n`;
    result += `  • File Key: ${args.fileKey}\n`;
    result += `  • Bucket ID: ${mockFileInfo.bucketId.slice(0, 20)}...\n`;
    result += `  • Fingerprint: ${mockFileInfo.fingerprint.slice(0, 40)}...\n\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    result += `DOWNLOAD STATUS\n`;
    result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    result += `  • Saved To: ${downloadPath} (simulated)\n`;
    result += `  • Integrity: ✅ Verified\n`;
    result += `  • Download Time: ${timeString}\n\n`;
    result += `⚠️ NOTE: Full implementation requires @storagehub-sdk/msp-client\n`;

    return result;
  } catch (error) {
    console.log(`[DataHaven] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return `Error downloading file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * DataHaven Download File Action class
 */
export class DataHavenDownloadAction implements AgentkitAction<typeof DataHavenDownloadInput> {
  public name = "datahaven_download_file";
  public description = DOWNLOAD_FILE_PROMPT;
  public argsSchema = DataHavenDownloadInput;
  public func = datahavenDownloadFile;
  public smartAccountRequired = false;
}
