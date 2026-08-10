/**
 * Tool-Gateway actions — the agent's "internet hands".
 *
 * The 0xGasless Tool Gateway fronts Apify's 57k-actor marketplace: discovery is
 * free, running an actor costs an x402 payment on Avalanche that OUR facilitator
 * settles. These actions let an agent search for a capability and run it, paying
 * from its KMS-custodied wallet under its spending policy.
 *
 * Platform-mode only (payments require the platform wallet). The gateway URL is
 * configurable so it can point at staging or a self-hosted gateway.
 */
import { z } from "zod";
import type { OxGasAgent } from "@0xgasless/agent";
import type { AgentkitAction } from "../agentkit";

const DEFAULT_GATEWAY_URL = "https://tools.0xgasless.com";

function gatewayUrl(): string {
  // Node + browser safe env read.
  const env = (typeof process !== "undefined" && process.env) || {};
  return (env.OXGAS_TOOL_GATEWAY_URL as string) || DEFAULT_GATEWAY_URL;
}

// ─── search_tools ────────────────────────────────────────────────────────────

const SEARCH_TOOLS_PROMPT = `
Search the 0xGasless Tool Gateway for a tool (an Apify actor) that can do a
real-world task on the internet — web scraping, browsing, search, data
extraction, social media, e-commerce, and more. Discovery is FREE (no payment).
Returns matching tool ids with titles and descriptions; use the id with
call_tool to actually run one (which costs a small x402 payment).
`;

export const SearchToolsInput = z
  .object({
    query: z.string().describe("What you need done, e.g. 'scrape google maps' or 'crawl a website'"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
  })
  .strip()
  .describe("Search the tool gateway for a capability");

export async function searchTools(
  client: OxGasAgent,
  _agentId: string,
  args: z.infer<typeof SearchToolsInput>,
): Promise<string> {
  try {
    const url = new URL("/tools/search", gatewayUrl());
    url.searchParams.set("q", args.query);
    if (args.limit) url.searchParams.set("limit", String(args.limit));
    // Discovery is free — a plain fetch, but reuse the client's fetch/config.
    const { response } = await client.x402.payFetch(url.toString(), { agentId: _agentId, maxValue: "0" });
    const data = await response.json();
    if (!response.ok) return `Tool search failed: ${JSON.stringify(data)}`;
    const tools = (data.tools || []).map(
      (t: { id: string; title?: string; description?: string }) =>
        `- ${t.id}${t.title ? ` (${t.title})` : ""}: ${t.description ?? ""}`.slice(0, 220),
    );
    return tools.length
      ? `Found ${tools.length} tool(s) for "${args.query}":\n${tools.join("\n")}\n\nRun one with call_tool.`
      : `No tools found for "${args.query}".`;
  } catch (error) {
    return `Tool search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class SearchToolsAction implements AgentkitAction<typeof SearchToolsInput> {
  public name = "search_tools";
  public description = SEARCH_TOOLS_PROMPT;
  public argsSchema = SearchToolsInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "search_tools requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = searchTools;
}

// ─── call_tool ───────────────────────────────────────────────────────────────

const CALL_TOOL_PROMPT = `
Run a tool (Apify actor) from the 0xGasless Tool Gateway and get its results.
This costs a small x402 payment on Avalanche, paid from the agent's custodied
wallet and settled by the 0xGasless facilitator — set maxValue (atomic units,
'1000000' = 1.00 USDC) to cap the spend. Find a tool id first with search_tools.
Pass the actor's input object as 'input' (shape depends on the tool; e.g. a
website crawler wants { startUrls: [{ url }] }). Returns the tool's dataset.
`;

export const CallToolInput = z
  .object({
    toolId: z.string().describe("Tool/actor id from search_tools, e.g. 'apify~website-content-crawler'"),
    input: z.record(z.any()).optional().describe("The tool's input object (tool-specific)"),
    maxValue: z
      .string()
      .describe("REQUIRED spend cap, atomic units ('1000000' = at most 1.00 USDC for this run)"),
  })
  .strip()
  .describe("Run a paid tool from the gateway");

export async function callTool(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof CallToolInput>,
): Promise<string> {
  try {
    const url = new URL(`/tools/${encodeURIComponent(args.toolId)}/run`, gatewayUrl()).toString();
    const { response, payment } = await client.x402.payFetch(url, {
      agentId,
      maxValue: args.maxValue,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: args.input ?? {} }),
      },
    });
    const data = await response.json();
    if (!response.ok) return `Tool run failed: ${JSON.stringify(data)}`;
    const paid = payment
      ? `Paid ${payment.requirement.maxAmountRequired} atomic units (tx ${data.transaction ?? "?"}). `
      : "";
    const items = JSON.stringify(data.items ?? data);
    const truncated = items.length > 6000 ? `${items.slice(0, 6000)}… (truncated)` : items;
    return `${paid}Tool ${args.toolId} returned:\n${truncated}`;
  } catch (error) {
    return `Tool run failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class CallToolAction implements AgentkitAction<typeof CallToolInput> {
  public name = "call_tool";
  public description = CALL_TOOL_PROMPT;
  public argsSchema = CallToolInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "call_tool requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = callTool;
}

// ─── browse_web (convenience over the rag-web-browser actor) ──────────────────

const BROWSE_WEB_PROMPT = `
Fetch and read a web page's content as clean text (or search the web and read
the top results) using the gateway's browser tool. Costs a small x402 payment
settled by the 0xGasless facilitator. Use this to let the agent read the
internet — give it a URL or a search query.
`;

export const BrowseWebInput = z
  .object({
    query: z.string().describe("A URL to read, or a search query to browse the web for"),
    maxResults: z.number().int().min(1).max(10).optional().describe("Max pages/results (default 3)"),
    maxValue: z.string().optional().describe("Spend cap, atomic units (default '500000' = 0.50 USDC)"),
  })
  .strip()
  .describe("Read the web via the gateway's browser tool");

export async function browseWeb(
  client: OxGasAgent,
  agentId: string,
  args: z.infer<typeof BrowseWebInput>,
): Promise<string> {
  return callTool(client, agentId, {
    toolId: "apify~rag-web-browser",
    input: { query: args.query, maxResults: args.maxResults ?? 3 },
    maxValue: args.maxValue ?? "500000",
  });
}

export class BrowseWebAction implements AgentkitAction<typeof BrowseWebInput> {
  public name = "browse_web";
  public description = BROWSE_WEB_PROMPT;
  public argsSchema = BrowseWebInput;
  public smartAccountRequired = false;
  public func = async (): Promise<string> =>
    "browse_web requires platform mode — configure Agentkit with configureWithPlatform().";
  public platformFunc = browseWeb;
}

export const TOOL_GATEWAY_ACTIONS = [
  new SearchToolsAction(),
  new CallToolAction(),
  new BrowseWebAction(),
];
