import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { SmartSwapAction, SmartBridgeAction } from "./DebridgeAction";
import {
  CowSwapSwapAction,
  CowSwapExecuteAction,
  CowSwapLimitOrderAction,
  CowSwapOrderQueryAction,
  CowSwapCancelOrderAction,
} from "./CowSwapAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
import { CreateAndStoreKeyAction } from "./createAndStoreKeyAction";
import { SxtAction } from "./sxt";

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new GetAddressAction(),
    new GetTokenDetailsAction(),
    new CheckTransactionAction(),
    new SmartTransferAction(),
    new SmartSwapAction(),
    new SmartBridgeAction(),
    new CowSwapSwapAction(),
    new CowSwapExecuteAction(),
    new CowSwapLimitOrderAction(),
    new CowSwapOrderQueryAction(),
    new CowSwapCancelOrderAction(),
    new CreateAndStoreKeyAction(),
    new SxtAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
