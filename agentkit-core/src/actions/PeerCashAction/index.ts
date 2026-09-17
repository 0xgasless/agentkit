import { PeerCashCapabilitiesAction } from "./capabilities";
import { PeerCashEstimateAction } from "./estimate";
import { PeerCashOrderAction } from "./order";
import { PeerCashOrdersAction } from "./orders";
import { PeerCashPrepareAccessPolicyAction } from "./prepareAccessPolicy";
import { PeerCashPrepareCashoutAction } from "./prepareCashout";
import { PeerCashPrepareTopUpAction } from "./prepareTopUp";
import { PeerCashPrepareWithdrawAction } from "./prepareWithdraw";

export { PeerCashCapabilitiesAction } from "./capabilities";
export { PeerCashEstimateAction } from "./estimate";
export { PeerCashOrderAction } from "./order";
export { PeerCashOrdersAction } from "./orders";
export { PeerCashPrepareAccessPolicyAction } from "./prepareAccessPolicy";
export { PeerCashPrepareCashoutAction } from "./prepareCashout";
export { PeerCashPrepareTopUpAction } from "./prepareTopUp";
export { PeerCashPrepareWithdrawAction } from "./prepareWithdraw";

/**
 * Peer Cash — Base USDC to fiat, non-custodial.
 *
 * Reads need no credential and every mutating verb returns unsigned
 * transactions, so the agent submits them through send_transaction and Peer
 * never sees a key.
 */
export const PEER_CASH_ACTIONS = [
  new PeerCashCapabilitiesAction(),
  new PeerCashEstimateAction(),
  new PeerCashPrepareCashoutAction(),
  new PeerCashPrepareAccessPolicyAction(),
  new PeerCashOrderAction(),
  new PeerCashOrdersAction(),
  new PeerCashPrepareTopUpAction(),
  new PeerCashPrepareWithdrawAction(),
];
