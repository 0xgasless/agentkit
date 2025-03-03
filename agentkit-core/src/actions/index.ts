import { CreateWalletAction } from "./createWalletAction";
import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
import { DebridgeSwapAction } from "./swapActionDebridge";

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new GetAddressAction(),
    new GetTokenDetailsAction(),
    new CreateWalletAction(),
    new CheckTransactionAction(),
    new SmartTransferAction(),
    new DebridgeSwapAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
