import "dotenv/config"; // Loads NANSEN_API_KEY from .env
import { getPnl } from "@0xgasless/agentkit"; // Update path if needed

async function main() {
  const result = await getPnl(null as any, {
    wallet_address: "0xde27d2e6b5009ead76ebc07452b54364fb54fdcd", // replace with any test wallet
    chains: ["base"], // choose a supported chain
    filters: {
      // Optional: Uncomment and edit to filter by time range, symbol, etc
      // timestamp: { from: "2024-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z" }
    },
    pagination: {
      page: 1,
      per_page: 10,
    },
    // Optional: Sorting
    // order_by: [{ field: "pnl_usd", direction: "DESC" }],
  });
  console.log(result);
}

main().catch(console.error);
