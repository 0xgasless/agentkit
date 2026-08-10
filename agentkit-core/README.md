<div align="center">
  <h1>0xGasless AgentKit</h1>
  <p><b>Give your AI agent a wallet and hands.</b> Custodied funds, gasless
  stablecoin payments, and the ability to pay for real work on the internet —
  as tools your LLM can call.</p>
</div>

## What it is

AgentKit turns the [0xGasless platform](https://dashboard.0xgasless.com) into a
set of agent tools. An agent gets a **KMS-custodied wallet** (no private key in
your process), a **server-enforced spending policy**, and actions to:

- **Pay** — send stablecoins (USDC/XSGD) and pay any [x402](https://docs.0xgasless.com/x402)
  API on the internet, gaslessly, under spend caps.
- **Do** — search and run tools from the 0xGasless Tool Gateway (backed by
  Apify's actor marketplace): browse the web, scrape pages, run search — paid
  per call from the agent's wallet.
- **Be trusted** — mint an ERC-8004 on-chain identity, check another agent's
  reputation before paying it, and leave feedback.

The agent needs **zero native gas token** — the 0xGasless facilitator pays the
gas. It only spends the stablecoin.

## Two modes

| Mode | Wallet | Use when |
|---|---|---|
| **Platform** (recommended) | KMS-custodied by 0xGasless; policy-enforced; no key in your code | You want payments, tools, identity, spend limits, audit |
| **Self-custody** | A local private key / mnemonic via an ERC-4337 smart account | You hold the key and want classic gasless DeFi actions |

## Install

```bash
npm install @0xgasless/agentkit
```

## Quick start (platform mode)

```ts
import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// 1. Configure — the API key (from your dashboard project) authenticates every
//    action; the wallet lives in 0xGasless KMS.
const agentkit = await Agentkit.configureWithPlatform({
  apiKey: process.env.OXGAS_API_KEY!,   // Dashboard → Project → Auth → API Key
  agentId: "my-first-agent",            // create with client.agents.create first
  chain: "avalanche-fuji",              // Avalanche is the primary network
});

// 2. Turn it into LangChain tools and hand them to your agent.
const tools = new AgentkitToolkit(agentkit).getTools();
const app = createReactAgent({ llm: new ChatOpenAI({ model: "gpt-4o" }), tools });

// 3. Let it work — it can now pay for what it needs.
await app.invoke({
  messages: [{ role: "user", content:
    "Find a tool that can read a web page, then read https://example.com and summarize it." }],
});
```

Behind that one prompt: the agent calls `search_tools` (free), picks the web
reader, calls `browse_web` → which pays ~$0.05 in USDC from its custodied wallet
via x402, settled on Avalanche by the 0xGasless facilitator → and gets the page
back. All under the spending policy you set in the dashboard.

## The actions

**Money (platform mode)**
- `x402_pay` — pay a recipient in USDC/XSGD, gasless, settled by the facilitator
- `pay_api` — fetch any URL and auto-pay if it responds `402` (with a mandatory `maxValue` cap)
- `smart_transfer` — transfer USDC/XSGD to an address
- `get_spend_status` — read the agent's caps + remaining daily budget
- `get_agent_wallet` — address, chain, balances

**Internet hands (Tool Gateway)**
- `search_tools` — discover a tool for a task (free)
- `call_tool` — run any gateway tool, paying per call under a cap
- `browse_web` — read/search the web (via the gateway's browser tool)
- `http_request` — a guarded plain HTTP call (https-only, SSRF-protected) for free/public APIs

**Trust (ERC-8004)**
- `register_identity` — mint the agent's on-chain identity (gas sponsored)
- `check_agent_reputation` — score + confidence + basis, before you pay another agent
- `give_agent_feedback` — record +/- feedback after an interaction

**DeFi (both modes)** — balances, token details, swaps & bridges (deBridge),
disperse, market data (DexScreener), and more. Call `getAllAgentkitActions()`
to enumerate the full set at runtime.

## Self-custody mode

```ts
const agentkit = await Agentkit.configureWithWallet({
  apiKey: process.env.API_KEY!,
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,  // you hold this key
  chainID: 43113,
});
```

Same toolkit; actions that require the platform (payments, tools, identity)
will say so. `run_terminal_command` is **disabled** unless you explicitly pass
`unsafeTerminalAccess: true` (only in a sandbox you control).

## Supported networks

Avalanche C-Chain (43114) and Avalanche Fuji (43113) are the primary, fully
supported networks. Base (8453), Sonic (146), and BSC (56) are available for
self-custody DeFi actions.

## Migrating from 0.0.x

Platform mode and the money/tool/trust actions are new in 1.0. Your existing
`configureWithWallet` code keeps working. See [MIGRATION.md](./MIGRATION.md).

## Documentation

- Platform & x402: https://docs.0xgasless.com
- Dashboard (get an API key): https://dashboard.0xgasless.com

## License

Apache-2.0
