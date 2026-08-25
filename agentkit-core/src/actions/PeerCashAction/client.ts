import { type CashClient, createCashClient, usdc } from "@zkp2p/cash";

/**
 * ERC-8021 analytics marker stamped on every Peer transaction these actions
 * prepare, so Peer can attribute the order to Agentkit. It carries no funds
 * and grants no permissions.
 */
const AGENTKIT_REFERRER = "0xgasless-agentkit";

const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";

/**
 * Peer production contracts used by the four custody-separated prepare paths.
 * These addresses come from the canonical Base deployment artifacts in
 * zkp2p/zkp2p-contracts.
 */
const PEER_CASH_BASE_TARGETS = new Set([
  "0x777777779d229cdf3110e9de47943791c26300ef", // EscrowV2
  "0x888888359e981b5225ca48fbcdceff702fc3b888", // OrchestratorV2
  "0xbc53641b4b2504f0061d6a9426c61b8ebe9b4ff0", // WhitelistPolicy
]);

type PeerPreparedTransaction = {
  chainId: number;
  to: string;
  data: string;
};

/**
 * Fail closed if the SDK prepares a transaction outside Peer Cash on Base.
 * USDC is accepted only for an `approve(address,uint256)` whose spender is an
 * allowlisted Peer Cash contract.
 *
 * @param txs - Transactions returned by a Peer Cash prepare method.
 * @throws If a chain, target, selector, or approve spender is unexpected.
 */
export function assertPeerTargets(txs: readonly PeerPreparedTransaction[]): void {
  for (const tx of txs) {
    if (tx.chainId !== BASE_CHAIN_ID) {
      throw new Error(`Peer Cash prepared unexpected chain ${tx.chainId}`);
    }

    const target = tx.to.toLowerCase();
    if (PEER_CASH_BASE_TARGETS.has(target)) continue;

    if (target === BASE_USDC_ADDRESS) {
      const data = tx.data.toLowerCase();
      if (
        !/^0x[0-9a-f]+$/.test(data) ||
        !data.startsWith(ERC20_APPROVE_SELECTOR) ||
        data.length < 138 ||
        data.slice(10, 34) !== "0".repeat(24)
      ) {
        throw new Error("Peer Cash prepared unexpected Base USDC call");
      }
      const spender = `0x${data.slice(34, 74)}`;
      if (PEER_CASH_BASE_TARGETS.has(spender)) continue;
      throw new Error(`Peer Cash prepared USDC approval for unexpected spender ${spender}`);
    }

    throw new Error(`Peer Cash prepared unexpected target ${tx.to}`);
  }
}

let client: CashClient | undefined;

/**
 * The shared Peer Cash client.
 *
 * Peer Cash reads need no credential and every mutating verb is exposed only
 * through its prepare path, so this client never holds, requests, or sees a
 * private key. `PEER_CASH_RPC_URL` overrides the public Base RPC, which is
 * rate limited; `PEER_CASH_REFERRAL_CODE` is the six-character code from the
 * Peer app that credits fills on the orders this agent opens.
 *
 * @returns The memoized `CashClient` bound to Peer production on Base.
 */
export function getPeerCashClient(): CashClient {
  if (!client) {
    const rpcUrl = process.env.PEER_CASH_RPC_URL;
    const referralCode = process.env.PEER_CASH_REFERRAL_CODE;
    client = createCashClient({
      environment: "production",
      referrer: AGENTKIT_REFERRER,
      ...(rpcUrl ? { rpcUrl } : {}),
      ...(referralCode ? { referralCode } : {}),
    });
  }
  return client;
}

/**
 * Pretty-print an already-serializable Peer Cash value for an LLM.
 *
 * @param value - A value produced by one of the `@zkp2p/cash` JSON codecs.
 * @returns Pretty-printed JSON.
 */
export function formatResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Turn a failure into the typed, actionable message Peer Cash errors carry.
 *
 * Every `CashError` has a `code`, a `retryable` flag, and a `remediation`
 * sentence, so the agent can decide whether to retry or change its input
 * instead of guessing from a stack trace.
 *
 * @param verb - The Peer Cash verb that failed, for the message prefix.
 * @param error - The thrown value.
 * @returns A single-line error message.
 */
export function formatError(verb: string, error: unknown): string {
  const source = error as {
    message?: unknown;
    code?: unknown;
    retryable?: unknown;
    remediation?: unknown;
  };
  const parts = [`Error: Peer Cash ${verb} failed.`];
  if (typeof source?.code === "string") parts.push(`[${source.code}]`);
  parts.push(typeof source?.message === "string" ? source.message : String(error));
  if (typeof source?.remediation === "string") parts.push(`Remediation: ${source.remediation}`);
  if (source?.retryable === true) parts.push("This error is retryable.");
  return parts.join(" ");
}

/**
 * Parse a decimal USDC amount into 6-decimal base units.
 *
 * @param amount - Decimal USDC amount, for example `"12.34"`.
 * @returns The amount in USDC base units.
 * @throws If the amount is not a positive decimal with at most 6 places.
 */
export function toUsdcBaseUnits(amount: string): bigint {
  const value = usdc(amount.trim());
  if (value <= 0n) {
    throw new Error(`amount must be greater than zero; received "${amount}"`);
  }
  return value;
}
