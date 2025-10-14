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
import {
  GetSmartMoneyNetflowAction,
  GetSmartMoneyHoldingsAction,
  GetSmartMoneyDexTradesAction,
  GetSmartMoneyDcasAction,
  GetCurrentBalanceAction,
  GetHistoricalBalanceAction,
  GetTransactionsAction,
  GetCounterpartiesAction,
  GetRelatedWalletsAction,
  GetPnlSummaryAction,
  GetPnlAction,
  GetLabelsAction,
  GetTransactionLookupAction,
  GetTokenScreenerAction,
  GetFlowIntelligenceAction,
  GetHoldersAction,
  GetFlowsAction,
  GetWhoBoughtSoldAction,
  GetDexTradesAction,
  GetTransfersAction,
  GetJupiterDcasAction,
  GetPnlLeaderboardAction,
  GetDefiHoldingsAction,
} from "./NansenAction";

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
    // Nansen Smart Money Actions
    new GetSmartMoneyNetflowAction(),
    new GetSmartMoneyHoldingsAction(),
    new GetSmartMoneyDexTradesAction(),
    new GetSmartMoneyDcasAction(),
    // Nansen Profiler Actions
    new GetCurrentBalanceAction(),
    new GetHistoricalBalanceAction(),
    new GetTransactionsAction(),
    new GetCounterpartiesAction(),
    new GetRelatedWalletsAction(),
    new GetPnlSummaryAction(),
    new GetPnlAction(),
    new GetLabelsAction(),
    new GetTransactionLookupAction(),
    // Nansen Token God Mode Actions
    new GetTokenScreenerAction(),
    new GetFlowIntelligenceAction(),
    new GetHoldersAction(),
    new GetFlowsAction(),
    new GetWhoBoughtSoldAction(),
    new GetDexTradesAction(),
    new GetTransfersAction(),
    new GetJupiterDcasAction(),
    new GetPnlLeaderboardAction(),
    // Nansen Portfolio Actions
    new GetDefiHoldingsAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
