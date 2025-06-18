import { z } from "zod";
import { AgentkitAction } from "../../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const GET_LATEST_TOKEN_PROFILES_PROMPT = `
Fetches the latest token profiles from DexScreener API.

This tool retrieves information about the latest token profiles including:
- Token URL
- Chain ID
- Token address
- Icon URL
- Header image URL
- Description
- Social links

This endpoint has a rate limit of 60 requests per minute.
`;

/**
 * Input schema for getting latest token profiles.
 * No parameters required for this endpoint.
 */
export const GetLatestTokenProfilesInput = z
  .object({})
  .strip()
  .describe("Get the latest token profiles from DexScreener");

/**
 * Response interface for token profile data.
 */
interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon: string;
  header: string | null;
  description: string | null;
  links: Array<{
    type: string | null;
    label: string | null;
    url: string;
  }> | null;
}

/**
 * Fetches the latest token profiles from DexScreener API.
 *
 * @param _wallet - The smart account (not used for this action).
 * @param _args - The input arguments (empty for this endpoint).
 * @returns A formatted string containing the latest token profiles.
 */
export async function getLatestTokenProfiles(
  _wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof GetLatestTokenProfilesInput>,
): Promise<string> {
  try {
    const response = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "0xGasless-AgentKit/1.0",
      },
    });

    if (!response.ok) {
      return `Error fetching token profiles: ${response.status} ${response.statusText}`;
    }

    const data: TokenProfile[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return "No token profiles found.";
    }

    let result = "🎯 Latest Token Profiles:\n\n";

    data.slice(0, 10).forEach((profile, index) => {
      result += `${index + 1}. Token Profile\n`;
      result += `   • Chain: ${profile.chainId}\n`;
      result += `   • Address: ${profile.tokenAddress}\n`;
      result += `   • URL: ${profile.url}\n`;

      if (profile.description) {
        const shortDesc =
          profile.description.length > 100
            ? `${profile.description.substring(0, 100)}...`
            : profile.description;
        result += `   • Description: ${shortDesc}\n`;
      }

      if (profile.links && profile.links.length > 0) {
        result += `   • Links: ${profile.links.length} social link(s)\n`;
      }

      result += "\n";
    });

    if (data.length > 10) {
      result += `... and ${data.length - 10} more profiles\n`;
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error fetching latest token profiles: ${errorMessage}`;
  }
}

/**
 * Get Latest Token Profiles action.
 */
export class GetLatestTokenProfilesAction
  implements AgentkitAction<typeof GetLatestTokenProfilesInput>
{
  public name = "get_latest_token_profiles";
  public description = GET_LATEST_TOKEN_PROFILES_PROMPT;
  public argsSchema = GetLatestTokenProfilesInput;
  public func = getLatestTokenProfiles;
  public smartAccountRequired = false;
}
