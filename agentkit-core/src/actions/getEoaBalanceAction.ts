import { z } from "zod";
import { AgentkitAction } from "../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { createEoaWallet } from "../services";
import { createPublicClient, http, formatEther } from "viem";
import { TokenABI } from "../constants";

export const GetEoaBalanceInput = z
  .object({
    tokenAddresses: z.array(z.string()).optional().nullable().describe("Optional ERC-20 token addresses to query"),
  })
  .strip();

export async function getEoaBalance(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetEoaBalanceInput>,
): Promise<string> {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const rpc = process.env.RPC_URL as string | undefined;
  const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;

  if (!pk || !rpc) {
    return "EOA not configured. Set PRIVATE_KEY, RPC_URL, CHAIN_ID.";
  }

  try {
    const eoa = createEoaWallet({ privateKey: pk, rpcUrl: rpc, chainId });
    const publicClient = createPublicClient({ transport: http(rpc) });

    const nativeBal = await publicClient.getBalance({ address: eoa.address });
    let result = `EOA Address: ${eoa.address}\nNative Balance: ${formatEther(nativeBal)}\n`;

    if (args.tokenAddresses && args.tokenAddresses.length > 0) {
      const lines: string[] = [];
      for (const addr of args.tokenAddresses) {
        try {
          const [decimals, symbol, bal] = await Promise.all([
            publicClient.readContract({ abi: TokenABI, address: addr as `0x${string}`, functionName: "decimals" }) as Promise<number>,
            publicClient.readContract({ abi: TokenABI, address: addr as `0x${string}`, functionName: "symbol" }) as Promise<string>,
            publicClient.readContract({
              abi: TokenABI,
              address: addr as `0x${string}`,
              functionName: "balanceOf",
              args: [eoa.address],
            }) as Promise<bigint>,
          ]);
          const denom = BigInt(10) ** BigInt(decimals);
          const whole = bal / denom;
          const frac = bal % denom;
          const formatted = `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0"}`;
          lines.push(`${symbol} (${addr}): ${formatted}`);
        } catch (err) {
          lines.push(`${addr}: error reading balance (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      result += lines.join("\n");
    }

    return result.trim();
  } catch (error) {
    return `Failed to fetch EOA balances: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class GetEoaBalanceAction implements AgentkitAction<typeof GetEoaBalanceInput> {
  public name = "get_eoa_balance";
  public description = "Returns the EOA native balance and optional ERC-20 balances.";
  public argsSchema = GetEoaBalanceInput;
  public func = getEoaBalance;
}
