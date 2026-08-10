import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account-sdk";
import { AgentkitAction } from "../../agentkit";
import { CRE_DOCS_SUMMARY } from "../../utils/chainlinkConstants";

const CHAINLINK_DOCS_PROMPT = `
This tool provides documentation and context about Chainlink CRE (Compute Runtime Environment).
It is useful when you need to understand how triggers work, how to configure forwarders, or how to troubleshoot deployment issues.

Optional parameters:
- query: A specific keyword to search for in the docs (e.g., "forwarder", "trigger").
`;

export const ChainlinkDocsInput = z
  .object({
    query: z.string().optional().describe("Keyword to search for in the documentation"),
  })
  .strip()
  .describe("Instructions for retrieving Chainlink CRE docs");

async function getChainlinkDocs(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof ChainlinkDocsInput>,
): Promise<string> {
  try {
    const docs = CRE_DOCS_SUMMARY;

    if (args.query) {
      const query = args.query.toLowerCase();
      const lines = docs.split("\n");
      const matchingLines = lines.filter(line => line.toLowerCase().includes(query));

      if (matchingLines.length > 0) {
        return `Found ${matchingLines.length} matches for "${args.query}":\n\n${matchingLines.join("\n")}\n\n--- Full Summary ---\n${docs}`;
      } else {
        return `No specific matches found for "${args.query}". Here is the full summary:\n\n${docs}`;
      }
    }

    return docs;
  } catch (error: any) {
    return `Error retrieving docs: ${error.message}`;
  }
}

export class ChainlinkDocsAction implements AgentkitAction<typeof ChainlinkDocsInput> {
  public name = "chainlink_cre_docs";
  public walletOptional = true;
  public description = CHAINLINK_DOCS_PROMPT;
  public argsSchema = ChainlinkDocsInput;
  public func = getChainlinkDocs;
  // This action doesn't strictly need a smart account, but following the pattern
  public smartAccountRequired = false;
}
