import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { SmartSwapAction, SmartBridgeAction } from "./DebridgeAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";
import { GetAddressAction } from "./getAddressAction";
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
import { ViaLabsBridgeAction, ViaLabsInfoAction } from "./ViaLabsAction";
import { DeployCREWorkflowAction } from "./DeployCREWorkflowAction/deployCREWorkflowAction";
import { ChainlinkDocsAction } from "./ChainlinkDocsAction/chainlinkDocsAction";
import { DeployContractAction } from "./DeployContractAction/deployContractAction";
import { CalculateTopicHashAction } from "./CalculateTopicHashAction/calculateTopicHashAction";
import { RunTerminalCommandAction } from "./RunTerminalCommandAction/runTerminalCommandAction";
import { AuroraWhitelistAction } from "./aurora/auroraWhitelistAction";
import { AuroraGasPolicyAction } from "./aurora/auroraGasPolicyAction";
import { PLATFORM_ACTIONS } from "./platform";
export * from "./platform";
import { TOOL_GATEWAY_ACTIONS } from "./tools";
export * from "./tools";
// TODO: DataHaven temporarily disabled due to ESM compatibility issue with @storagehub/api-augment
// import {
//   DataHavenInfoAction,
//   DataHavenCreateBucketAction,
//   DataHavenUploadAction,
//   DataHavenDownloadAction,
//   DataHavenListBucketsAction,
// } from "./DataHavenAction";

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
    new SxtAction(),
    new GetLatestTokenProfilesAction(),
    new GetLatestBoostedTokensAction(),
    new GetTopBoostedTokensAction(),
    new GetTokenOrdersAction(),
    new GetPairsByChainAndAddressAction(),
    new SearchPairsAction(),
    new GetPairsByTokenAddressesAction(),
    new DisperseAction(),
    new ViaLabsBridgeAction(),
    new ViaLabsInfoAction(),
    new DeployCREWorkflowAction(),
    new ChainlinkDocsAction(),
    new DeployContractAction(),
    new CalculateTopicHashAction(),
    new RunTerminalCommandAction(),
    new AuroraWhitelistAction(),
    new AuroraGasPolicyAction(),
    // Platform-mode money layer (KMS custody + x402 + spend policy)
    ...PLATFORM_ACTIONS,
    // Tool Gateway — the agent's internet hands (Apify actors, paid via x402)
    ...TOOL_GATEWAY_ACTIONS,
    // TODO: DataHaven temporarily disabled due to ESM compatibility issue
    // new DataHavenInfoAction(),
    // new DataHavenCreateBucketAction(),
    // new DataHavenUploadAction(),
    // new DataHavenDownloadAction(),
    // new DataHavenListBucketsAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();
