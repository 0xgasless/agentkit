<div align="center">
  <h1>0xGasless AgentKit</h1>
  <p><b>Give your AI agent a wallet and hands.</b><br/>
  Custodied funds, gasless stablecoin payments, and the ability to pay for real
  work on the internet — as tools your LLM can call.</p>
</div>

<div align="center">
  <img src="https://img.shields.io/npm/v/@0xgasless/agentkit" alt="npm version">
  <img src="https://img.shields.io/npm/dm/@0xgasless/agentkit" alt="npm downloads">
  <img src="https://img.shields.io/github/license/0xgasless/agentkit" alt="license">
</div>

## Overview

0xGasless AgentKit turns the [0xGasless platform](https://dashboard.0xgasless.com)
into a set of tools an AI agent can call. An agent gets a **KMS-custodied wallet**
(no private key in your process), a **server-enforced spending policy**, and the
ability to:

- **Pay** — send stablecoins (USDC/XSGD) and pay any [x402](https://docs.0xgasless.com/x402)
  API on the internet, gaslessly, under spend caps.
- **Do** — search and run tools from the 0xGasless Tool Gateway (backed by
  Apify's actor marketplace): browse the web, scrape pages, run search — paid
  per call from the agent's wallet.
- **Be trusted** — mint an ERC-8004 on-chain identity, check another agent's
  reputation before paying it, and leave feedback.

The agent needs **zero native gas token** — the 0xGasless facilitator pays the
gas; the agent only spends the stablecoin.

## Install

```bash
npm install @0xgasless/agentkit
```

## Quick start

```ts
import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// The API key (from your dashboard project) authenticates every action;
// the wallet lives in 0xGasless KMS.
const agentkit = await Agentkit.configureWithPlatform({
  apiKey: process.env.OXGAS_API_KEY!,   // Dashboard → Project → Auth → API Key
  agentId: "my-first-agent",
  chain: "avalanche-fuji",
});

const tools = new AgentkitToolkit(agentkit).getTools();
const app = createReactAgent({ llm: new ChatOpenAI({ model: "gpt-4o" }), tools });

await app.invoke({
  messages: [{ role: "user", content:
    "Find a tool that can read a web page, then read https://example.com and summarize it." }],
});
```

Behind that one prompt the agent discovers a web-reader tool (free), runs it —
paying ~$0.05 in USDC from its custodied wallet via x402, settled on Avalanche
by the 0xGasless facilitator — and gets the page back. See the runnable
[end-to-end demo](./agentkit-core/examples/pay-for-tools.ts).

## Two modes

| Mode | Wallet | Use when |
|---|---|---|
| **Platform** (recommended) | KMS-custodied by 0xGasless; policy-enforced; no key in your code | You want payments, tools, identity, spend limits, audit |
| **Self-custody** | A local private key / mnemonic via an ERC-4337 smart account | You hold the key and want classic gasless DeFi actions |

## The actions

**Money (platform mode)** — `x402_pay`, `pay_api` (auto-pay any 402 endpoint,
capped), `smart_transfer`, `get_spend_status`, `get_agent_wallet`

**Internet hands (Tool Gateway)** — `search_tools`, `call_tool`, `browse_web`,
and a guarded `http_request` for free/public APIs

**Trust (ERC-8004)** — `register_identity`, `check_agent_reputation`,
`give_agent_feedback`

**DeFi (both modes)** — transfers, swaps & bridges (deBridge), disperse, token
details, market data (DexScreener), and more. Call `getAllAgentkitActions()`
to enumerate the full set.

## Supported networks

Avalanche C-Chain (43114) and Avalanche Fuji (43113) are the primary, fully
supported networks. Base (8453), Sonic (146), and BSC (56) are available for
self-custody DeFi actions.

## Repository structure

```
./
├── agentkit-core/          the published package — @0xgasless/agentkit
│   ├── src/                Agentkit, the toolkit, and all actions
│   ├── examples/           runnable demos (pay-for-tools.ts)
│   ├── README.md           package docs
│   └── MIGRATION.md        0.0.x → 1.0 upgrade guide
└── agentkit-demo/          a LangChain chatbot example wiring it all together
```

## Documentation

- Package README & actions: [`agentkit-core/README.md`](./agentkit-core/README.md)
- Migrating from 0.0.x: [`agentkit-core/MIGRATION.md`](./agentkit-core/MIGRATION.md)
- Platform & x402: https://docs.0xgasless.com
- Dashboard (get an API key): https://dashboard.0xgasless.com

## Contributing

New actions go in `agentkit-core/src/actions/` implementing the `AgentkitAction`
interface — they're picked up automatically by `getAllAgentkitActions()` and the
toolkit. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0

## Community

- [X](https://x.com/0xGasless) · [LinkedIn](https://www.linkedin.com/company/0xgasless/)
