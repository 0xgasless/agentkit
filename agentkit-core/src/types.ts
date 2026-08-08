import { UserOpReceipt } from "@0xgasless/smart-account-sdk";

export type TransactionResponse = {
  success: boolean;
  userOpHash?: string;
  txHash?: string;
  error?: string | { message: string; code: number };
  message?: string;
  receipt?: UserOpReceipt;
};

export type TokenDetails = {
  name: string;
  symbol: string;
  decimals: bigint;
  address: `0x${string}`;
  chainId: number;
};

export type TransactionStatus = {
  status: "pending" | "confirmed" | "failed";
  receipt?: UserOpReceipt;
  error?: string;
  blockNumber?: number;
  blockConfirmations?: number;
};
