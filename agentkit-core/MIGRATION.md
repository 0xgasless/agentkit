# Migrating to AgentKit 1.0

1.0 is **additive** — existing self-custody code keeps working. The headline is
a new **platform mode** (KMS-custodied wallets + payments + tools + identity)
and a cleanup of the chain list and unsafe actions.

## Nothing breaks if you used `configureWithWallet`

```ts
// still works exactly as before
const agentkit = await Agentkit.configureWithWallet({
  apiKey, privateKey, chainID: 43113,
});
```

Your existing DeFi actions (transfers, swaps, bridges, balances, market data)
are unchanged.

## What's new

- **`Agentkit.configureWithPlatform({ apiKey, agentId, chain })`** — the wallet
  is custodied by 0xGasless (AWS KMS), spending policy is enforced server-side,
  and you get the money / tool / trust actions. No private key in your process.
- **Money actions:** `x402_pay`, `pay_api`, `get_spend_status`, `get_agent_wallet`
  (and `smart_transfer` now works in platform mode for USDC/XSGD).
- **Tool Gateway actions:** `search_tools`, `call_tool`, `browse_web` — pay per
  call to run Apify actors, settled by the 0xGasless facilitator on Avalanche.
- **Trust actions:** `register_identity`, `check_agent_reputation`,
  `give_agent_feedback` (ERC-8004).
- **`http_request`** — a guarded generic HTTP tool (https-only, SSRF-protected),
  the safe replacement for shelling out to `curl`.

## Breaking / behavior changes

- **Chains:** Fantom (250) and Moonbeam (1284) were **removed**. Sonic's chain
  ID was corrected from `156` to the real `146`. Avalanche (mainnet + Fuji) is
  the primary network; Base and BSC remain for self-custody DeFi.
- **`run_terminal_command` is disabled by default.** It executed arbitrary
  shell commands. To keep using it, pass `unsafeTerminalAccess: true` to
  `configureWithWallet` / `configureWithPlatform`, and only in a sandbox you
  control.
- **`create_and_store_key` was removed** — it stored a private key in a local
  SQLite file, which contradicts the custody model. (The `sqlite3` and
  `merkletreejs` dependencies are gone with it, so installs are lighter.)

## Config knobs

- `OXGAS_TOOL_GATEWAY_URL` — point the tool actions at a specific gateway
  (defaults to the production gateway).
- `OXGAS_HTTP_ALLOWLIST` — comma-separated hostnames; when set, `http_request`
  may only reach those hosts.
