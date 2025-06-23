import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { SmartSwapAction, SmartBridgeAction } from "./DebridgeAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
import { CreateAndStoreKeyAction } from "./createAndStoreKeyAction";
import { SxtAction } from "./sxt";
import { ListServerWalletsAction } from "./listServerWalletsAction";
import { SelectServerWalletAction } from "./selectServerWalletAction";

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new GetAddressAction(),
    new GetTokenDetailsAction(),
    new CheckTransactionAction(),
    new SmartTransferAction(),
    new SmartSwapAction(),
    new SmartBridgeAction(),
    new CreateAndStoreKeyAction(),
    new SxtAction(),
    new ListServerWalletsAction(),
    new SelectServerWalletAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
