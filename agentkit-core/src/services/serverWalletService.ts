import { Transaction } from "@0xgasless/smart-account";
import { TransactionResponse } from "../types";

export interface ServerWallet {
  id: number;
  agentkitId: number;
  smartAddress: string;
  accountIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServerTransactionLog {
  id: number;
  agentkitId: number;
  walletId: number;
  from: string;
  to: string;
  chainId: number;
  status: string;
  transactionHash?: string;
  userOpHash?: string;
  rawTx: {
    to: string;
    data: string;
    value: string;
  };
  createdAt: string;
  updatedAt: string;
}

export class ServerWalletService {
  private apiKey: string;
  private serverUrl: string;

  constructor(apiKey: string, serverUrl: string) {
    this.apiKey = apiKey;
    this.serverUrl = serverUrl;
  }

  private getHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
    };
  }

  async listWallets(): Promise<ServerWallet[]> {
    try {
      const response = await fetch(`${this.serverUrl}/api/agentkit/v1/wallets`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to list wallets: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error listing wallets:", error);
      throw new Error(`Failed to list wallets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendTransaction(
    walletIndex: number,
    transaction: Transaction,
  ): Promise<TransactionResponse> {
    try {
      const body = {
        to: transaction.to,
        data: transaction.data || "0x",
        value: transaction.value?.toString() || "0",
      };

      const response = await fetch(
        `${this.serverUrl}/api/agentkit/v1/wallets/${walletIndex}/send-transaction`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Transaction failed: ${error}`);
      }

      const result = await response.json();

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Transaction failed",
        };
      }

      return {
        success: true,
        txHash: result.txHash,
        userOpHash: result.receipt?.userOpHash,
        message: result.message,
        receipt: result.receipt,
      };
    } catch (error) {
      console.error("Error sending transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getTransactions(): Promise<{ success: boolean; transactions: ServerTransactionLog[] }> {
    try {
      const response = await fetch(`${this.serverUrl}/api/agentkit/v1/transactions`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get transactions: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error getting transactions:", error);
      throw new Error(`Failed to get transactions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 