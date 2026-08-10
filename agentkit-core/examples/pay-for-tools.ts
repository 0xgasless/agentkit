/**
 * Flagship demo: an agent that pays for its own work.
 *
 * The full loop, end to end:
 *   1. create (or reuse) a KMS-custodied agent wallet
 *   2. the agent discovers a tool it needs      (free)
 *   3. it runs the tool, paying per call in USDC — signed by its custodied
 *      wallet, gasless, settled on Avalanche by the 0xGasless facilitator
 *   4. it gets the result back
 *
 * Prerequisites:
 *   - OXGAS_API_KEY  — an API key from your dashboard project
 *   - the agent's wallet funded with a little USDC on Avalanche Fuji
 *     (get its address from step 1, send ~$1 of Fuji USDC)
 *   - OXGAS_TOOL_GATEWAY_URL — the Tool Gateway base URL (optional; defaults to
 *     the production gateway)
 *
 * Run:  OXGAS_API_KEY=... npx tsx examples/pay-for-tools.ts
 */
import { OxGasAgent } from "@0xgasless/agent";
import { Agentkit, getAllAgentkitActions } from "../src";

const API_KEY = process.env.OXGAS_API_KEY;
const AGENT_ID = process.env.AGENT_ID ?? "demo-pays-for-tools";
const CHAIN = "avalanche-fuji" as const;

if (!API_KEY) {
  console.error("Set OXGAS_API_KEY (dashboard → project → Auth → API Key).");
  process.exit(1);
}

async function main() {
  // ── 1. Ensure the agent exists (KMS-custodied wallet) ──
  const client = new OxGasAgent({ apiKey: API_KEY! });
  const agent = await client.agents.create({ agentId: AGENT_ID, chain: CHAIN });
  console.log(`Agent ${AGENT_ID} @ ${agent.address} on ${CHAIN}`);
  console.log(`→ Fund this address with a little USDC on Fuji, then re-run if the balance is 0.\n`);

  const balance = await client.agents.getBalance(AGENT_ID, { chain: CHAIN });
  console.log("Balance:", JSON.stringify(balance), "\n");

  // ── 2. Configure AgentKit in platform mode ──
  const agentkit = await Agentkit.configureWithPlatform({
    apiKey: API_KEY!,
    agentId: AGENT_ID,
    chain: CHAIN,
  });
  const actions = getAllAgentkitActions();
  const run = (name: string, args: unknown) => {
    const a = actions.find((x) => x.name === name)!;
    return agentkit.run(a, args as never);
  };

  // ── 3. Discover a tool (free) ──
  console.log("search_tools('read a web page'):");
  console.log(await run("search_tools", { query: "read a web page", limit: 3 }), "\n");

  // ── 4. Run it — this pays per call from the custodied wallet ──
  console.log("browse_web('https://example.com') — pays via x402, settled on Avalanche:");
  console.log(await run("browse_web", { query: "https://example.com", maxValue: "500000" }), "\n");

  // ── 5. Show what was spent ──
  console.log("get_spend_status:");
  console.log(await run("get_spend_status", {}));
}

main().catch((e) => {
  console.error("Demo failed:", e);
  process.exit(1);
});
