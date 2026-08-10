/**
 * Trust actions — ERC-8004 identity, reputation, and validation as agent tools.
 *
 * These let an agent establish its own verifiable on-chain identity, and — more
 * importantly for an agent economy — CHECK another agent's reputation before it
 * pays or delegates to it, and leave feedback afterward. All gas is sponsored by
 * the 0xGasless platform. Platform-mode only.
 */
import { z } from "zod";
import type { OxGasAgent } from "@0xgasless/agent";
import type { AgentkitAction } from "../agentkit";

const CHAINS = ["avalanche", "avalanche-fuji", "fuji", "base", "solana-devnet"] as const;

// ─── register_identity ───────────────────────────────────────────────────────

const REGISTER_IDENTITY_PROMPT = `
Register (mint) this agent's ERC-8004 on-chain identity — a verifiable NFT other
contracts and agents can look up to confirm who this agent is. Gas is sponsored
by 0xGasless. Idempotent: calling again returns the existing identity. Optional
chain (defaults to the agent's chain). Use this once so the agent can build
reputation and be trusted by others.
`;

export const RegisterIdentityInput = z
  .object({ chain: z.enum(CHAINS).optional().describe("Chain to register on (default: agent's chain)") })
  .strip()
  .describe("Register the agent's ERC-8004 identity");

export async function registerIdentity(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof RegisterIdentityInput>,
): Promise<string> {
  try {
    const r = await client.identity.link({ agentId, chain: args.chain });
    return r.alreadyRegistered
      ? `Agent ${agentId} already has an identity on ${r.chain}: token ${r.agentTokenId ?? "?"} (${r.address}).`
      : `Registered ERC-8004 identity for ${agentId} on ${r.chain}: token ${r.agentTokenId ?? "?"}, tx ${r.txHash ?? "?"}.`;
  } catch (error) {
    return `Identity registration failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class RegisterIdentityAction implements AgentkitAction<typeof RegisterIdentityInput> {
  public name = "register_identity";
  public description = REGISTER_IDENTITY_PROMPT;
  public argsSchema = RegisterIdentityInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "register_identity requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = registerIdentity;
}

// ─── check_agent_reputation ──────────────────────────────────────────────────

const CHECK_REPUTATION_PROMPT = `
Check another agent's reputation BEFORE paying, hiring, or trusting it. Returns
a composite score (0-100), a confidence level, and how the score is backed
('bonded' = staked on-chain validations, 'opinion-only' = unbacked feedback,
'mixed'). Use this to decide whether to transact with an unknown agent. Free.
Provide the target agent's id; optional tag narrows to a capability (e.g.
'price-data').
`;

export const CheckReputationInput = z
  .object({
    targetAgentId: z.string().describe("The agent whose reputation to check"),
    tag: z.string().optional().describe("Only count endorsements with this tag/capability"),
    chain: z.enum(CHAINS).optional().describe("Chain to read reputation on"),
  })
  .strip()
  .describe("Check an agent's ERC-8004 reputation");

export async function checkReputation(
  client: OxGasAgent,
  _agentId: string,
  args: z.infer<typeof CheckReputationInput>,
): Promise<string> {
  try {
    const s = await client.reputation.getScore(args.targetAgentId, { tag: args.tag, chain: args.chain });
    const caution =
      s.basis === "opinion-only"
        ? " ⚠️ opinion-only (no staked validations backing this) — treat with caution."
        : "";
    return (
      `Reputation for ${args.targetAgentId}: score ${s.score}/100, confidence ${s.confidence}, ` +
      `basis '${s.basis}' (${s.bondedCount} bonded, ${s.feedbackCount} feedback).${caution}`
    );
  } catch (error) {
    return `Reputation check failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CheckReputationAction implements AgentkitAction<typeof CheckReputationInput> {
  public name = "check_agent_reputation";
  public description = CHECK_REPUTATION_PROMPT;
  public argsSchema = CheckReputationInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "check_agent_reputation requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = checkReputation;
}

// ─── give_feedback ───────────────────────────────────────────────────────────

const GIVE_FEEDBACK_PROMPT = `
Leave reputation feedback for another agent after interacting with it (e.g. it
delivered good data, or it failed). Signed by this agent and recorded on-chain
(gas sponsored). value is +100 for positive or -100 for negative; optional tags
label the capability. Self-review is rejected. Use this to build the agent trust
graph after a transaction.
`;

export const GiveFeedbackInput = z
  .object({
    targetAgentId: z.string().describe("The agent you're reviewing"),
    value: z.number().int().min(-100).max(100).describe("+100 good, -100 bad"),
    tag1: z.string().optional().describe("Capability tag, e.g. 'price-data'"),
    tag2: z.string().optional().describe("Second tag"),
  })
  .strip()
  .describe("Leave reputation feedback for another agent");

export async function giveFeedback(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof GiveFeedbackInput>,
): Promise<string> {
  try {
    const r = await client.reputation.giveFeedback({
      agentId: args.targetAgentId,
      fromAgentId: agentId,
      value: args.value,
      tag1: args.tag1,
      tag2: args.tag2,
    });
    return `Feedback recorded for ${args.targetAgentId} (value ${args.value}). ${JSON.stringify(r)}`;
  } catch (error) {
    return `Feedback failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class GiveFeedbackAction implements AgentkitAction<typeof GiveFeedbackInput> {
  public name = "give_agent_feedback";
  public description = GIVE_FEEDBACK_PROMPT;
  public argsSchema = GiveFeedbackInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "give_agent_feedback requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = giveFeedback;
}

export const TRUST_ACTIONS = [
  new RegisterIdentityAction(),
  new CheckReputationAction(),
  new GiveFeedbackAction(),
];
