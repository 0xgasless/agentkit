/**
 * Peer Cash smoke test — runs against dist/.
 *
 * Offline by default: registration, wallet-optional dispatch, argument schemas,
 * and the typed error surface, none of which touch the network.
 *
 * Set PEER_CASH_SMOKE_LIVE=1 to also read Peer production (capabilities,
 * estimate, order, orders) and build an unsigned cash-out plan. Nothing is ever
 * signed or broadcast: the prepare path returns transactions and stops.
 */
import assert from "node:assert/strict";

const { Agentkit, getAllAgentkitActions } = await import("../dist/index.js");
const { assertPeerTargets } = await import("../dist/actions/PeerCashAction/client.js");

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PEER_ESCROW = "0x777777779d229cdF3110e9de47943791c26300Ef";
const PEER_POLICY = "0xBC53641b4B2504f0061D6a9426C61B8eBE9B4Ff0";
const APPROVE_SELECTOR = "095ea7b3";
const approve = spender =>
  `0x${APPROVE_SELECTOR}${spender.slice(2).toLowerCase().padStart(64, "0")}${"1".padStart(64, "0")}`;

const ACTIONS = [
  "peer_cash_capabilities",
  "peer_cash_estimate",
  "peer_cash_prepare_cashout",
  "peer_cash_prepare_access_policy",
  "peer_cash_order",
  "peer_cash_orders",
  "peer_cash_prepare_topup",
  "peer_cash_prepare_withdraw",
];

const actions = getAllAgentkitActions();
const byName = n => actions.find(a => a.name === n);

// ── registration ──

for (const name of ACTIONS) {
  const action = byName(name);
  assert.ok(action, `missing ${name}`);
  assert.equal(action.walletOptional, true, `${name} should be walletOptional`);
  assert.equal(action.smartAccountRequired, false, `${name} should not require a smart account`);
  assert.ok(action.description.length > 200, `${name} needs a description an LLM can act on`);
  assert.ok(action.argsSchema, `${name} needs an argsSchema`);
}

// Every prepare verb must tell the agent it returns unsigned transactions.
for (const name of ACTIONS.filter(n => n.includes("prepare"))) {
  assert.match(byName(name).description, /UNSIGNED/, `${name} must state that it does not sign`);
  assert.match(
    byName(name).description,
    /send_transaction/,
    `${name} must name the signing action`,
  );
}

// ── argument schemas ──

assert.deepEqual(
  byName("peer_cash_estimate").argsSchema.parse({ amount: "250", currency: "EUR" }),
  {
    amount: "250",
    currency: "EUR",
  },
);
assert.throws(() =>
  byName("peer_cash_estimate").argsSchema.parse({ amount: 250, currency: "EUR" }),
);
assert.throws(() => byName("peer_cash_order").argsSchema.parse({}));
assert.deepEqual(byName("peer_cash_orders").argsSchema.parse({}), {});

// ── typed errors, without a wallet and without the network ──

const bare = new Agentkit();

// ── prepared transaction target allowlist ──

assert.doesNotThrow(() =>
  assertPeerTargets([
    { chainId: 8453, to: BASE_USDC, data: approve(PEER_ESCROW) },
    { chainId: 8453, to: PEER_ESCROW, data: "0x12345678" },
    { chainId: 8453, to: PEER_POLICY, data: "0x12345678" },
  ]),
);
assert.throws(
  () => assertPeerTargets([{ chainId: 1, to: PEER_ESCROW, data: "0x12345678" }]),
  /unexpected chain/,
);
assert.throws(
  () =>
    assertPeerTargets([
      { chainId: 8453, to: "0x1111111111111111111111111111111111111111", data: "0x12345678" },
    ]),
  /unexpected target/,
);
assert.throws(
  () =>
    assertPeerTargets([
      {
        chainId: 8453,
        to: BASE_USDC,
        data: approve("0x1111111111111111111111111111111111111111"),
      },
    ]),
  /unexpected spender/,
);
for (const data of [
  "0xdeadbeef",
  approve(PEER_ESCROW).replace(APPROVE_SELECTOR, "deadbeef"),
  approve(PEER_ESCROW).replace(`${APPROVE_SELECTOR}000000`, `${APPROVE_SELECTOR}100000`),
]) {
  assert.throws(
    () => assertPeerTargets([{ chainId: 8453, to: BASE_USDC, data }]),
    /unexpected Base USDC call/,
  );
}

const badAmount = await bare.run(byName("peer_cash_estimate"), {
  amount: "12.3456789",
  currency: "USD",
});
assert.match(badAmount, /^Error: Peer Cash estimate failed\./);
assert.match(badAmount, /decimals/);

const noAddress = await bare.run(byName("peer_cash_orders"), {});
assert.match(noAddress, /needs an address/);

// ── live reads (opt in) ──

if (process.env.PEER_CASH_SMOKE_LIVE === "1") {
  const capabilities = JSON.parse(await bare.run(byName("peer_cash_capabilities"), {}));
  assert.equal(capabilities.chainId, 8453);
  assert.equal(capabilities.token.symbol, "USDC");
  assert.equal(capabilities.pricing.spreadBps, 0);
  assert.ok(capabilities.platforms.length > 0, "expected at least one payout platform");

  const platform = capabilities.platforms.find(p => p.currencies.includes("USD"));
  assert.ok(platform, "expected a platform paying USD");

  const estimate = JSON.parse(
    await bare.run(byName("peer_cash_estimate"), {
      amount: "100",
      currency: "USD",
      platform: platform.platform,
    }),
  );
  assert.equal(estimate.currency, "USD");
  assert.equal(estimate.amount, "100000000");
  assert.ok(estimate.receiveAmount > 0, "expected a positive fiat estimate");

  const plan = JSON.parse(
    await bare.run(byName("peer_cash_prepare_cashout"), {
      amount: "25",
      platform: "zelle",
      currency: "USD",
      payee: process.env.PEER_CASH_SMOKE_PAYEE ?? "richard2015@gmail.com",
    }),
  );
  assert.equal(plan.txs.length, plan.steps.length);
  assert.equal(plan.steps[0].kind, "approve");
  assert.equal(plan.steps[1].kind, "createDeposit");
  for (const tx of plan.txs) {
    assert.equal(tx.chainId, 8453);
    assert.match(tx.to, /^0x[0-9a-fA-F]{40}$/);
    assert.match(tx.data, /^0x[0-9a-fA-F]+$/);
  }
  assert.equal(plan.accessPolicyRequired, false, "zelle needs no access policy");

  const depositId = process.env.PEER_CASH_SMOKE_ORDER_ID;
  if (depositId) {
    const order = JSON.parse(await bare.run(byName("peer_cash_order"), { depositId }));
    assert.equal(order.depositId, depositId);
    assert.ok(
      ["awaiting-buyer", "matched", "delivering", "delivered", "returned"].includes(order.state),
      `unexpected order state ${order.state}`,
    );

    const owner = depositId.split("_")[0];
    const orders = JSON.parse(await bare.run(byName("peer_cash_orders"), { address: owner }));
    assert.ok(Array.isArray(orders), "peer_cash_orders should return an array");
  }
}

console.log(
  `PEER CASH SMOKE: all assertions passed${process.env.PEER_CASH_SMOKE_LIVE === "1" ? " (including live production reads)" : " (offline)"}`,
);
