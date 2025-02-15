import { Agentkit } from "./agentkit";
import dotenv from "dotenv";
import { getAllAgentkitActions } from "./actions";
import { z } from "zod";

dotenv.config();

async function testActions() {
  try {
    console.log("Config:", {
      hasPrivateKey: !!process.env.PRIVATE_KEY,
      hasApiKey: !!process.env.API_KEY,
      hasCmcApiKey: !!process.env.CMC_API_KEY,
    });

    // Initialize Agentkit
    const agentkit = await Agentkit.configureWithWallet({
      privateKey: process.env.PRIVATE_KEY as `0x${string}`,
      rpcUrl: process.env.RPC_URL as string,
      apiKey: process.env.API_KEY as string,
      chainID: Number(process.env.CHAIN_ID) || 8453,
      cmcApiKey: process.env.CMC_API_KEY as string,
    });

    // Get all actions
    const actions = getAllAgentkitActions();

    // Test get_address
    console.log("\nTesting get_address:");
    const addressResult = await agentkit.run(actions[5], actions[5].argsSchema.parse({}));
    console.log(addressResult);

    // Test get_balance
    console.log("\nTesting get_balance:");
    const balanceResult = await agentkit.run(actions[0], actions[0].argsSchema.parse({}));
    console.log(balanceResult);

    // Test token_analysis
    console.log("\nTesting token_analysis:");
    const analysisResult = await agentkit.run(
      actions[6],
      actions[6].argsSchema.parse({
        type: "listings",
        limit: 5,
      }),
    );
    console.log(analysisResult);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run tests
testActions();

// "test": "bunx jest --no-cache --testMatch='**/*_test.ts'",
