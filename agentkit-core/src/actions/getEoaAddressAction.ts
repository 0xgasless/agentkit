import { z } from "zod";
import { AgentkitAction } from "../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { createEoaWallet } from "../services";

export const GetEoaAddressInput = z.object({}).strip();

export async function getEoaAddress(
  _wallet: ZeroXgaslessSmartAccount,
  _args: z.infer<typeof GetEoaAddressInput>,
): Promise<string> {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const rpc = process.env.RPC_URL as string | undefined;
  const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;

  if (!pk || !rpc) {
    return "EOA not configured. Set PRIVATE_KEY, RPC_URL, CHAIN_ID.";
  }

  try {
    const eoa = createEoaWallet({ privateKey: pk, rpcUrl: rpc, chainId });
    return `EOA Address: ${eoa.address}`;
  } catch (error) {
    return `Failed to initialize EOA wallet: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class GetEoaAddressAction implements AgentkitAction<typeof GetEoaAddressInput> {
  public name = "get_eoa_address";
  public description = "Returns the EOA wallet address.";
  public argsSchema = GetEoaAddressInput;
  public func = getEoaAddress;
}
