import "dotenv/config";
import { getCurrentBalance } from "@0xgasless/agentkit";

async function main() {
  const address = "0x50Fa6437631194662Be1D9Babe6FA300774e07A5";
  // The Nansen API uses "avalanche" for the mainnet. 
  // "fuji" is the testnet and may not be supported by this endpoint.
  const chain = "base"; // Changed to "base" as requested

  console.log(`Fetching balance for ${address} on ${chain}...`);

  try {
    // The first argument to getCurrentBalance is a smart wallet, which is not needed for this action.
    // We can pass 'null' and cast it to 'any' to satisfy the type checker.
    const result = await getCurrentBalance(null as any, {
      address: address,
      chain: chain,
    });

    console.log(result);
  } catch (error) {
    console.error("An error occurred during the test:", error);
  }
}

main();
