import { DeployCREWorkflowAction } from "./src/actions/DeployCREWorkflowAction/deployCREWorkflowAction";
import { ChainlinkDocsAction } from "./src/actions/ChainlinkDocsAction/chainlinkDocsAction";
import { CRE_SUPPORTED_NETWORKS } from "./src/utils/chainlinkConstants";

async function verifyActions() {
  console.log("Verifying Chainlink Actions...");

  // 1. Verify DeployCREWorkflowAction
  console.log("\n1. Testing DeployCREWorkflowAction instantiation...");
  const deployAction = new DeployCREWorkflowAction();
  console.log(`Action Name: ${deployAction.name}`);
  if (deployAction.name !== "deploy_cre_workflow") {
    throw new Error("DeployCREWorkflowAction name mismatch");
  }
  console.log("DeployCREWorkflowAction instantiated successfully.");

  // 1b. Verify Supported Networks
  console.log("\n1b. Checking Supported Networks...");
  const avaxTestnet = CRE_SUPPORTED_NETWORKS["avalanche-fuji"];
  if (!avaxTestnet || avaxTestnet.chainSelector !== "avalanche-testnet-fuji") {
    throw new Error("Avalanche Fuji config missing or incorrect");
  }
  console.log("Network config looks correct.");

  // 2. Verify ChainlinkDocsAction
  console.log("\n2. Testing ChainlinkDocsAction instantiation...");
  const docsAction = new ChainlinkDocsAction();
  console.log(`Action Name: ${docsAction.name}`);
  if (docsAction.name !== "chainlink_cre_docs") {
    throw new Error("ChainlinkDocsAction name mismatch");
  }

  // 2b. Test Docs Logic (Action Function)
  console.log("\n2b. Testing Docs Retrieval Logic...");
  const docsResult = await docsAction.func({} as any, { query: "forwarder" });
  if (!docsResult.includes("KeystoneForwarder")) {
    throw new Error("Docs query for 'forwarder' did not return expected content.");
  }
  console.log("Docs retrieval logic verified.");

  console.log("\n✅ All Chainlink Actions Verified Successfully!");
}

verifyActions().catch((err) => {
  console.error("\n❌ Verification Failed:", err);
  process.exit(1);
});
