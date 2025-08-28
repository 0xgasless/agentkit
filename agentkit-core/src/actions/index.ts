import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { SmartSwapAction, SmartBridgeAction } from "./DebridgeAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
import { CreateAndStoreKeyAction } from "./createAndStoreKeyAction";
import { SxtAction } from "./sxt";
import {
  GetLatestTokenProfilesAction,
  GetLatestBoostedTokensAction,
  GetTopBoostedTokensAction,
  GetTokenOrdersAction,
  GetPairsByChainAndAddressAction,
  SearchPairsAction,
  GetPairsByTokenAddressesAction,
} from "./DexScreenerAction";
import { DisperseAction } from "./disperseAction";
import { GetEoaAddressAction } from "./getEoaAddressAction";
import { GetEoaBalanceAction } from "./getEoaBalanceAction";

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new GetBalanceAction(),
    new GetAddressAction(),
    new GetEoaAddressAction(),
    new GetEoaBalanceAction(),
    new GetTokenDetailsAction(),
    new CheckTransactionAction(),
    new SmartTransferAction(),
    new SmartSwapAction(),
    new SmartBridgeAction(),
    new CreateAndStoreKeyAction(),
    new SxtAction(),
    new GetLatestTokenProfilesAction(),
    new GetLatestBoostedTokensAction(),
    new GetTopBoostedTokensAction(),
    new GetTokenOrdersAction(),
    new GetPairsByChainAndAddressAction(),
    new SearchPairsAction(),
    new GetPairsByTokenAddressesAction(),
    new DisperseAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
