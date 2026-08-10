/**
 * http_request — a guarded generic HTTP tool.
 *
 * The safe replacement for reaching into `run_terminal_command` just to `curl`
 * a URL. It makes ONE outbound HTTP request with hard guardrails:
 *   - https only (http allowed only for localhost during dev)
 *   - SSRF protection: refuses private / loopback / link-local / cloud-metadata
 *     hosts so an agent can't be tricked into hitting internal services
 *   - request timeout + response size cap
 *   - optional allowlist of hostnames (OXGAS_HTTP_ALLOWLIST) — when set, only
 *     those hosts are reachable
 *
 * This runs in ANY mode (walletOptional) — it moves data, not money. For PAID
 * endpoints (HTTP 402) use pay_api instead, which signs a payment.
 */
import { z } from "zod";
import type { AgentkitAction } from "../agentkit";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 100_000;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./, // link-local incl. cloud metadata 169.254.169.254
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
  /\.internal$/i,
  /\.local$/i,
  /metadata\.google\.internal/i,
];

const HTTP_REQUEST_PROMPT = `
Make a single HTTP request to a public URL and return the response — use this to
call public REST APIs, fetch JSON/text, or POST data. HTTPS only; private,
internal, and cloud-metadata addresses are blocked for safety. If the endpoint
responds 402 Payment Required, use pay_api instead (it signs a payment).
Inputs: url, optional method (GET/POST/PUT/DELETE), optional headers object,
optional body string.
`;

export const HttpRequestInput = z
  .object({
    url: z.string().url().describe("The public URL to request (https)"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method (default GET)"),
    headers: z.record(z.string()).optional().describe("Request headers"),
    body: z.string().optional().describe("Request body (string; JSON should be pre-stringified)"),
  })
  .strip()
  .describe("Make a guarded HTTP request to a public API");

function hostAllowed(hostname: string): { ok: boolean; reason?: string } {
  const host = hostname.toLowerCase();
  for (const pat of BLOCKED_HOST_PATTERNS) {
    if (pat.test(host)) return { ok: false, reason: `host '${host}' is blocked (private/internal/metadata)` };
  }
  const env = (typeof process !== "undefined" && process.env) || {};
  const allowlist = String(env.OXGAS_HTTP_ALLOWLIST || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length && !allowlist.some((a) => host === a || host.endsWith(`.${a}`))) {
    return { ok: false, reason: `host '${host}' is not in the configured allowlist` };
  }
  return { ok: true };
}

export async function httpRequest(
  _wallet: unknown,
  args: z.infer<typeof HttpRequestInput>,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(args.url);
  } catch {
    return `Invalid URL: ${args.url}`;
  }
  const isLocalhostDev = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhostDev)) {
    return `Refused: only https URLs are allowed (got ${url.protocol}).`;
  }
  const gate = hostAllowed(url.hostname);
  if (!gate.ok) return `Refused: ${gate.reason}.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: args.method ?? "GET",
      headers: args.headers,
      body: args.body,
      signal: controller.signal,
      redirect: "manual", // don't silently follow redirects to blocked hosts
    });
    if (res.status === 402) {
      return `The endpoint requires payment (HTTP 402). Use pay_api to pay and fetch it instead.`;
    }
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BODY_BYTES) {
          chunks.push(value.slice(0, Math.max(0, MAX_BODY_BYTES - (received - value.byteLength))));
          break;
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array()),
    );
    const truncated = received > MAX_BODY_BYTES ? " … (truncated)" : "";
    return `HTTP ${res.status} ${res.statusText}\n${text}${truncated}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes("aborted") ? `Request timed out after ${DEFAULT_TIMEOUT_MS}ms.` : `Request failed: ${msg}`;
  } finally {
    clearTimeout(timer);
  }
}

export class HttpRequestAction implements AgentkitAction<typeof HttpRequestInput> {
  public name = "http_request";
  public description = HTTP_REQUEST_PROMPT;
  public argsSchema = HttpRequestInput;
  public smartAccountRequired = false;
  public walletOptional = true;
  public func = httpRequest as unknown as AgentkitAction<typeof HttpRequestInput>["func"];
}
