/**
 * Platform-mode smoke test — runs against dist/ with a fully mocked backend.
 * Verifies: configureWithPlatform, action dispatch, x402_pay, pay_api (402
 * flow), spend status, unsafe-terminal gating, legacy-action fallback message.
 */
import assert from "node:assert/strict";

const { Agentkit, getAllAgentkitActions } = await import("../dist/index.js");

const SIGNED = {
  payerAddress: "0xPayer", agentId: "bot-1", tokenSymbol: "USDC", chain: "avalanche-fuji",
  paymentPayload: { token: "0x5425890298aed601595a70AB815c96711a31Bc65",
    payload: { authorization: { from: "0xPayer", to: "0xM", value: "500000", validAfter: 0, validBefore: 2000000000, nonce: "0x1" }, signature: "0xsig" } },
  paymentRequirements: { network: "avalanche-fuji", chainId: 43113 },
  policy: { perTxCapUSD: 5, perDayCapUSD: 50, spentTodayUSD: 0.5, remainingTodayUSD: 49.5 },
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const routes = [
  ["/v1/agent/get", () => json(200, { agentId: "bot-1", address: "0xAgentAddr", chain: "avalanche-fuji", status: "active" })],
  ["/v1/agent/balance", () => json(200, { balances: [{ chain: "avalanche-fuji", token: "USDC", balance: "2000000" }] })],
  ["/v1/agent/policy", () => json(200, { scope: "agent", perTxCapUSD: 5, perDayCapUSD: 50, spentTodayUSD: 0.5 })],
  ["/v1/agent/x402/sign", () => json(200, SIGNED)],
  ["/settle", () => json(200, { success: true, transaction: "0xsettled", network: "avalanche-fuji" })],
  ["paid.example", (url, init) => {
    const h = new Headers(init?.headers);
    if (!h.get("X-PAYMENT")) return json(402, { accepts: [{ scheme: "exact", network: "avalanche-fuji", maxAmountRequired: "500000", payTo: "0xM", asset: "0x5425890298aed601595a70AB815c96711a31Bc65" }] });
    return json(200, { data: "the paid content" });
  }],
];
const mockFetch = async (url, init) => {
  for (const [m, h] of routes) if (String(url).includes(m)) return h(String(url), init);
  throw new Error(`unmocked: ${url}`);
};

const kit = await Agentkit.configureWithPlatform({
  apiKey: "test-key", agentId: "bot-1", chain: "avalanche-fuji", fetch: mockFetch,
});
assert.equal(kit.isPlatformMode(), true);
assert.equal(await kit.getAddress(), "0xAgentAddr");
assert.equal(await kit.getChainId(), 43113);

const actions = getAllAgentkitActions();
const byName = (n) => actions.find((a) => a.name === n);
for (const n of ["x402_pay", "pay_api", "get_spend_status", "get_agent_wallet"]) assert.ok(byName(n), `missing ${n}`);

// x402_pay settles through the (mocked) 0xgasless facilitator
const payOut = await kit.run(byName("x402_pay"), { to: "0xM", value: "500000" });
assert.match(payOut, /0xsettled/);
assert.match(payOut, /Remaining daily budget: \$49.5/);

// pay_api completes the 402 loop and returns the body
const apiOut = await kit.run(byName("pay_api"), { url: "https://paid.example/data", maxValue: "600000" });
assert.match(apiOut, /Paid 500000 atomic units/);
assert.match(apiOut, /the paid content/);

// pay_api maxValue guard refuses
const refused = await kit.run(byName("pay_api"), { url: "https://paid.example/data", maxValue: "100" });
assert.match(refused, /exceeds maxValue/);

// spend status + wallet
assert.match(await kit.run(byName("get_spend_status"), {}), /perDayCapUSD/);
assert.match(await kit.run(byName("get_agent_wallet"), {}), /0xAgentAddr/);

// unsafe terminal is refused without the flag
const term = byName("run_terminal_command");
assert.ok(term, "terminal action should still be registered");
assert.match(await kit.run(term, { command: "echo hi" }), /disabled/);

// legacy self-custody action explains itself in platform mode
const legacy = byName("get_balance");
assert.match(await kit.run(legacy, {}), /not available in platform mode/);

// ── Phase 1: wallet-optional + transfer delegation + pruning ──

// wallet-optional pure action runs in platform mode without a smart account
const topic = byName("calculate_topic_hash");
assert.ok(topic.walletOptional, "calculate_topic_hash should be walletOptional");
const topicOut = await kit.run(topic, { eventSignature: "Transfer(address,address,uint256)" });
assert.match(topicOut, /0xddf252ad/i); // canonical Transfer topic0

// ...and even with NO wallet configured at all
const bare = new (Object.getPrototypeOf(kit).constructor)();
const bareOut = await bare.run(topic, { eventSignature: "Transfer(address,address,uint256)" });
assert.match(bareOut, /0xddf252ad/i);

// DexScreener suite is wallet-optional now
assert.ok(byName("search_pairs").walletOptional, "dexscreener should be walletOptional");

// smart_transfer delegates USDC to x402.pay in platform mode (1.5 → 1500000 atomic)
const xferOut = await kit.run(byName("smart_transfer"), {
  amount: "1.5", tokenAddress: "USDC", destination: "0xM",
});
assert.match(xferOut, /Successfully transferred 1.5 USDC/);
assert.match(xferOut, /0xsettled/);

// unknown token in platform mode explains itself
const badXfer = await kit.run(byName("smart_transfer"), {
  amount: "1", tokenAddress: "0xdeadbeef", destination: "0xM",
});
assert.match(badXfer, /support USDC and XSGD/);

// create_and_store_key is gone from the registry
assert.equal(byName("create_and_store_key"), undefined, "key-storage action should be removed");

// ── Phase 2: Tool Gateway actions ──

for (const n of ["search_tools", "call_tool", "browse_web"]) assert.ok(byName(n), `missing ${n}`);

// point the gateway at our mock and add its routes
process.env.OXGAS_TOOL_GATEWAY_URL = "https://gw.example";
routes.push(["gw.example/tools/search", () =>
  json(200, { tools: [{ id: "apify~website-content-crawler", title: "Website Content Crawler", description: "Crawl and extract page text" }] })]);
routes.push(["gw.example/tools/", (url, init) => {
  const h = new Headers(init?.headers);
  if (!h.get("X-PAYMENT")) return json(402, { accepts: [{ scheme: "exact", network: "avalanche-fuji", maxAmountRequired: "50000", payTo: "0xGW", asset: "0x5425890298aed601595a70AB815c96711a31Bc65" }] });
  return json(200, { actor: "apify~website-content-crawler", transaction: "0xtoolrun", items: [{ url: "https://x.com", text: "hello world" }] });
}]);

// search_tools is free (no payment) and lists results
const searchOut = await kit.run(byName("search_tools"), { query: "crawl a website" });
assert.match(searchOut, /website-content-crawler/);

// call_tool pays via the 402 loop and returns items
const callOut = await kit.run(byName("call_tool"), {
  toolId: "apify~website-content-crawler",
  input: { startUrls: [{ url: "https://x.com" }] },
  maxValue: "100000",
});
assert.match(callOut, /0xtoolrun/);
assert.match(callOut, /hello world/);

// call_tool respects the spend cap
const cappedOut = await kit.run(byName("call_tool"), {
  toolId: "apify~website-content-crawler", maxValue: "1",
});
assert.match(cappedOut, /exceeds maxValue|Tool run failed/);

// browse_web delegates to the rag-web-browser actor
const browseOut = await kit.run(byName("browse_web"), { query: "https://x.com" });
assert.match(browseOut, /hello world/);

console.log("PLATFORM SMOKE: all assertions passed");
