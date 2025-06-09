import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { SmartConfidentialTransferAction } from "./confidentialTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { SmartDepositAction } from "./depositTokenAction";
import { SmartSwapAction } from "./smartSwapAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
import  { SmartWithdrawTokenAction } from './withdrawTokenAction';

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new GetAddressAction(),
    new GetTokenDetailsAction(),
    new CheckTransactionAction(),
    new SmartTransferAction(),
    new SmartConfidentialTransferAction(),
    new SmartSwapAction(),
    new SmartDepositAction(),
    new SmartWithdrawTokenAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
