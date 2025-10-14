import { z } from "zod";
import { AgentkitAction } from "../../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_TRANSACTIONS_PROMPT = `Retrieve transaction history for a specific wallet address across multiple blockchains. This endpoint provides detailed transaction information including transfers, swaps, and other blockchain activities.`;

// Input schema (match Nansen)
export const GetTransactionsInput = z.object({
  address: z.string().describe("The wallet address to get transactions for"),
  chain: z
    .enum([
      // short list here, but can expand as per Nansen docs
      "arbitrum",
      "avalanche",
      "base",
      "bnb",
      "ethereum",
      "optimism",
      "polygon",
      "solana",
      "bitcoin",
      "zksync",
      // ... all others as needed
    ])
    .describe("Blockchain chain for the transactions"),
  date: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  hide_spam_token: z.boolean().default(true),
  filters: z
    .object({
      transaction_hash: z.string().optional(),
      transaction_type: z.array(z.string()).optional(),
      token_address: z.string().optional(),
      token_symbol: z.string().optional(),
      counterparty_address: z.string().optional(),
      counterparty_label: z.string().optional(),
      // Fix: use volume_usd not value_usd
      volume_usd: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      // Fix: use blockTimestamp for timestamp range filter
      blockTimestamp: z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  pagination: z
    .object({
      page: z.number().min(1).default(1),
      per_page: z.number().min(1).max(20).default(10),
    })
    .optional(),
  order_by: z
    .array(
      z.object({
        // Fix: use block_timestamp per nansen docs
        field: z.enum([
          "chain",
          "transaction_hash",
          "block_number",
          "block_timestamp",
          "from_address",
          "to_address",
          "volume_usd",
          "cost_usd",
          "fee_usd",
        ]),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
});

export async function getTransactions(
  _smartAccount: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetTransactionsInput>,
) {
  const nansenApiKey = process.env.NANSEN_API_KEY;
  if (!nansenApiKey) throw new Error("Nansen API key is not set");

  const url = "https://api.nansen.ai/api/v1/profiler/address/transactions";
  console.log(`Fetching transactions for ${args.address} on ${args.chain}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: nansenApiKey, // Key fix!
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to fetch transactions: ${response.statusText} - ${JSON.stringify(errorData)}`,
    );
  }

  const data = await response.json();
  if (!data.result || data.result.length === 0) {
    return `No transactions found for wallet ${args.address}.`;
  }

  return data;
}

export class GetTransactionsAction implements AgentkitAction<typeof GetTransactionsInput> {
  name = "getTransactions";
  description = GET_TRANSACTIONS_PROMPT;
  inputSchema = GetTransactionsInput;
  argsSchema = GetTransactionsInput;
  func = getTransactions;

  async run(smartAccount: ZeroXgaslessSmartAccount, args: z.infer<typeof GetTransactionsInput>) {
    const data = await getTransactions(smartAccount, args);
    return data;
  }
}
