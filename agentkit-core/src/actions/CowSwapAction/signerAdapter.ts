import { Signer, TypedDataDomain, TypedDataField } from "ethers";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { WalletClient } from "viem";

/**
 * Adapter to make ZeroXgaslessSmartAccount compatible with ethers Signer interface
 * This extends ethers.Signer to pass isTypedDataSigner() checks
 */
export class SmartAccountSignerAdapter extends Signer {
  private smartAccount: ZeroXgaslessSmartAccount;
  private walletClient: WalletClient;

  constructor(smartAccount: ZeroXgaslessSmartAccount, walletClient: WalletClient) {
    super();
    this.smartAccount = smartAccount;
    this.walletClient = walletClient;
  }

  async getAddress(): Promise<string> {
    return this.smartAccount.getAddress();
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const messageString = typeof message === "string" ? message : new TextDecoder().decode(message);
    return this.smartAccount.signMessage(messageString);
  }

  // This is the method that ethers.isTypedDataSigner() checks for
  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    return this.signTypedData(domain, types, value);
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    // Use the wallet client for signTypedData since smart account doesn't support it
    if (!this.walletClient.account) {
      throw new Error("Wallet client account not available");
    }
    return await this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId ? Number(domain.chainId) : undefined,
        verifyingContract: domain.verifyingContract as `0x${string}`,
        salt: domain.salt as `0x${string}`,
      },
      types,
      primaryType: this._getPrimaryType(types, value),
      message: value,
    });
  }

  // Required by Signer interface but not used for CowSwap
  async signTransaction(_transaction: unknown): Promise<string> {
    throw new Error("signTransaction not implemented for smart account signer adapter");
  }

  connect(_provider: unknown): Signer {
    return new SmartAccountSignerAdapter(this.smartAccount, this.walletClient);
  }

  // Helper to determine primary type from types object
  private _getPrimaryType(
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>,
  ): string {
    // For CowSwap, it's typically "Order"
    const possibleTypes = Object.keys(types);

    // Try to find the type that matches the value structure
    for (const typeName of possibleTypes) {
      const typeFields = types[typeName];
      const valueKeys = Object.keys(value);

      // Check if all required fields are present
      const hasAllFields = typeFields.every(
        field => valueKeys.includes(field.name) || field.name === "type",
      );

      if (hasAllFields) {
        return typeName;
      }
    }

    // Default fallback
    return possibleTypes[0] || "Order";
  }
}
