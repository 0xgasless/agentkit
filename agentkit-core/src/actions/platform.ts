/**
 * Platform-mode actions — the agent's money layer, backed by the 0xGasless
 * platform: KMS-custodied wallet, server-enforced spending policy, x402
 * payments, full audit trail. These are the actions that let an agent PAY for
 * things on the internet safely.
 *
 * All of them require Agentkit.configureWithPlatform({ apiKey, agentId }).
 */
import { z } from "zod";
import type { OxGasAgent, Chain } from "@0xgasless/agent";
import type { AgentkitAction } from "../agentkit";

const CHAIN_VALUES = [
  "avalanche",
  "avalanche-fuji",
  "fuji",
  "base",
  "solana",
  "solana-devnet",
] as const;

// ─── x402_pay ────────────────────────────────────────────────────────────────

const X402_PAY_PROMPT = `
Pay a recipient address with the agent's custodied wallet using an x402 gasless
stablecoin payment. The 0xGasless facilitator settles the transfer on-chain and
pays all gas — the agent wallet needs zero native tokens, only the stablecoin.
Server-side spending policy (per-transaction and daily USD caps) is enforced
before signing; a payment over the cap fails with a policy error.
Inputs: recipient address, amount in atomic units (USDC/XSGD have 6 decimals,
so "1000000" = 1.00), optional token symbol (USDC default, or XSGD) and chain.
Returns the settlement transaction hash.
`;

export const X402PayInput = z
  .object({
    to: z.string().describe("Recipient address (0x… for EVM chains)"),
    value: z.string().describe("Amount in atomic units — '1000000' = 1.00 for 6-decimal tokens"),
    tokenSymbol: z.enum(["USDC", "XSGD"]).optional().describe("Token to pay with (default USDC)"),
    chain: z.enum(CHAIN_VALUES).optional().describe("Chain to pay on (default: the agent's chain)"),
  })
  .strip()
  .describe("Instructions for making an x402 payment");

export async function x402Pay(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof X402PayInput>,
): Promise<string> {
  try {
    const result = await client.x402.pay({
      agentId,
      to: args.to,
      value: args.value,
      tokenSymbol: args.tokenSymbol,
      chain: args.chain as Chain | undefined,
    });
    const tx = result.settle?.transaction;
    const remaining = result.signed.policy?.remainingTodayUSD;
    return (
      `Payment settled. Transaction: ${tx ?? "(pending)"} on ${result.signed.chain}. ` +
      `Paid ${args.value} atomic units of ${result.signed.tokenSymbol} to ${args.to}.` +
      (remaining !== undefined ? ` Remaining daily budget: $${remaining}.` : "")
    );
  } catch (error) {
    return `Payment failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class X402PayAction implements AgentkitAction<typeof X402PayInput> {
  public name = "x402_pay";
  public description = X402_PAY_PROMPT;
  public argsSchema = X402PayInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "x402_pay requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = x402Pay;
}

// ─── pay_api ────────────────────────────────────────────────────────────────

const PAY_API_PROMPT = `
Fetch a URL and automatically pay for it if the API responds with HTTP 402
Payment Required (the x402 protocol). Use this to consume paid APIs, paid data
feeds, and paid tools — the payment is signed by the agent's custodied wallet
under its spending policy, then the request is retried with the payment
attached, and the API's response body is returned.
ALWAYS set maxValue (atomic units) to cap what this call may pay: "1000000" =
at most 1.00 USDC. If the API's price exceeds maxValue the call refuses to pay.
Free endpoints pass through unchanged.
`;

export const PayApiInput = z
  .object({
    url: z.string().url().describe("The URL to fetch (may respond 402 with a price)"),
    maxValue: z
      .string()
      .describe("REQUIRED spending cap for this call, atomic units ('1000000' = 1.00 USDC max)"),
    method: z.enum(["GET", "POST"]).optional().describe("HTTP method (default GET)"),
    body: z.string().optional().describe("Request body for POST (JSON string)"),
  })
  .strip()
  .describe("Instructions for fetching (and paying for) an x402 API");

export async function payApi(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof PayApiInput>,
): Promise<string> {
  try {
    const init: RequestInit = { method: args.method ?? "GET" };
    if (args.body) {
      init.body = args.body;
      init.headers = { "Content-Type": "application/json" };
    }
    const { response, payment } = await client.x402.payFetch(args.url, {
      agentId,
      maxValue: args.maxValue,
      init,
    });
    const text = await response.text();
    const truncated = text.length > 6000 ? `${text.slice(0, 6000)}… (truncated)` : text;
    const paidNote = payment
      ? `Paid ${payment.requirement.maxAmountRequired} atomic units on ${payment.envelope.network}. `
      : "No payment was required. ";
    return `${paidNote}HTTP ${response.status}. Response:\n${truncated}`;
  } catch (error) {
    return `pay_api failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class PayApiAction implements AgentkitAction<typeof PayApiInput> {
  public name = "pay_api";
  public description = PAY_API_PROMPT;
  public argsSchema = PayApiInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "pay_api requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = payApi;
}

// ─── get_spend_status ───────────────────────────────────────────────────────

const SPEND_STATUS_PROMPT = `
Read the agent's spending policy and remaining budget: per-transaction USD cap,
daily USD cap, how much was spent today, and what's left. Use this BEFORE
making payments to reason about affordability, and AFTER a policy error to
explain what limit was hit. Free to call.
`;

export const SpendStatusInput = z.object({}).strip().describe("No inputs required");

export async function getSpendStatus(
  client: OxGasAgent,
  agentId: string,
  _args: z.infer<typeof SpendStatusInput>,
): Promise<string> {
  try {
    const policy = await client.policy.get(agentId);
    return `Spending policy for ${agentId}: ${JSON.stringify(policy)}`;
  } catch (error) {
    return `Failed to read spending policy: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class GetSpendStatusAction implements AgentkitAction<typeof SpendStatusInput> {
  public name = "get_spend_status";
  public description = SPEND_STATUS_PROMPT;
  public argsSchema = SpendStatusInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "get_spend_status requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = getSpendStatus;
}

// ─── get_agent_wallet ───────────────────────────────────────────────────────

const AGENT_WALLET_PROMPT = `
Get the agent's custodied wallet details: address, chain, status, and token
balances. The private key lives in the 0xGasless platform's KMS — it cannot be
exported or printed. Free to call.
`;

export const AgentWalletInput = z
  .object({
    chain: z
      .enum([...CHAIN_VALUES, "all"])
      .optional()
      .describe("Chain to read balances for, or 'all' (default: the agent's chain)"),
  })
  .strip()
  .describe("Instructions for reading the agent wallet");

export async function getAgentWallet(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof AgentWalletInput>,
): Promise<string> {
  try {
    const agent = await client.agents.get(agentId);
    const balance = await client.agents.getBalance(agentId, {
      chain: args.chain as (Chain | "all") | undefined,
    });
    return (
      `Agent ${agentId}: address ${agent.address}, chain ${agent.chain}, status ${agent.status}. ` +
      `Balances: ${JSON.stringify(balance)}`
    );
  } catch (error) {
    return `Failed to read agent wallet: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class GetAgentWalletAction implements AgentkitAction<typeof AgentWalletInput> {
  public name = "get_agent_wallet";
  public description = AGENT_WALLET_PROMPT;
  public argsSchema = AgentWalletInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "get_agent_wallet requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = getAgentWallet;
}

export const PLATFORM_ACTIONS = [
  new X402PayAction(),
  new PayApiAction(),
  new GetSpendStatusAction(),
  new GetAgentWalletAction(),
];
