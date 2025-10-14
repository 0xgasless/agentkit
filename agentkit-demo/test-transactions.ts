import "dotenv/config";
import { getTransactions } from "@0xgasless/agentkit";

async function main() {
  const result = await getTransactions(
    null as any,
    {
      address: "0x50Fa6437631194662Be1D9Babe6FA300774e07A5",
      chain: "base",
      date: {
        from: "2024-01-01T00:00:00Z",
        to: "2025-10-14T23:59:59Z",
      },
      // optional fields below ensure default, clean API request
      hide_spam_token: true,
      // add more fields as needed (filters, pagination, order_by)
    }
  );
  console.log(JSON.stringify(result, null, 2)); // pretty-print result
}

main().catch(console.error);
