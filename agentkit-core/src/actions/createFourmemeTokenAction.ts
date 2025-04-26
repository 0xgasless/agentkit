import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import axios from "axios";
import {
  createPublicClient,
  http,
  parseAbi,
  encodeAbiParameters,
  decodeEventLog,
  fromHex,
} from "viem";
import { bsc } from "viem/chains";
import { AgentkitAction } from "../agentkit";

const TOKEN_MANAGER2_ADDRESS = "0x5c952063c7fc8610FFDB798152D69F0B9550762b"; // On BSC

// ABI for the createToken function in TokenManager2
const TOKEN_MANAGER2_ABI = parseAbi([
  "function createToken(bytes args, bytes signature) payable",
  "event TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)",
]);

// API endpoints
const API_BASE_URL = "https://four.meme/meme-api";
const GENERATE_NONCE_ENDPOINT = "/v1/private/user/nonce/generate";
const LOGIN_ENDPOINT = "/v1/private/user/login/dex";
const UPLOAD_TOKEN_IMAGE_ENDPOINT = "/v1/private/token/upload";
const CREATE_TOKEN_ENDPOINT = "/v1/private/token/create";

const CREATE_FOURMEME_TOKEN_PROMPT = `
This tool creates a new token on Fourmeme platform without using the Fourmeme interface directly.

It handles the complete flow:
1. Authentication with the user's wallet
2. Uploading a token image
3. Getting token creation parameters and signature
4. Executing the token creation transaction on-chain

Parameters:
- name: Token name (e.g., "My Token")
- symbol: Token symbol/ticker (e.g., "MTK")
- description: Token description
- imageUrl: Optional URL to an image (if not provided, user needs to upload)
- imageFile: Base64 encoded image file content (required if imageUrl not provided)
- launchTime: Optional timestamp for token launch (defaults to 24 hours from now)
- category: Token category (one of: Meme, AI, Defi, Games, Infra, De-Sci, Social, Depin, Charity, Others)
- websiteUrl: Optional project website URL
- twitterUrl: Optional project Twitter URL
- telegramUrl: Optional project Telegram URL
- preSale: Optional pre-purchased BNB amount by creator (defaults to 0)

Notes:
- Total token supply is fixed at 1 billion
- Raised amount is fixed at 24 BNB
- Sale ratio is fixed at 80%
- BNB is used as the base currency
`;

// Create a schema as a ZodObject directly to match the ActionSchemaAny type
export const CreateFourmemeTokenInput = z.object({
  name: z.string().describe("Token name (e.g., 'My Token')"),
  symbol: z.string().describe("Token symbol/ticker (e.g., 'MTK')"),
  description: z.string().describe("Token description"),
  imageUrl: z.string().optional().describe("Optional URL to an already uploaded image"),
  imageFile: z
    .string()
    .optional()
    .describe("Base64 encoded image file content (required if imageUrl not provided)"),
  launchTime: z
    .number()
    .optional()
    .describe("Optional timestamp for token launch (defaults to 24 hours from now)"),
  category: z
    .enum([
      "Meme",
      "AI",
      "Defi",
      "Games",
      "Infra",
      "De-Sci",
      "Social",
      "Depin",
      "Charity",
      "Others",
    ])
    .describe("Token category"),
  websiteUrl: z.string().optional().describe("Optional project website URL"),
  twitterUrl: z.string().optional().describe("Optional project Twitter URL"),
  telegramUrl: z.string().optional().describe("Optional project Telegram URL"),
  preSale: z
    .string()
    .optional()
    .describe("Optional pre-purchased BNB amount by creator (defaults to 0)"),
});

/**
 * Get a nonce from the Fourmeme API
 *
 * @param walletAddress - The wallet address of the user
 * @returns The generated nonce
 */
async function getNonce(walletAddress: string): Promise<string> {
  try {
    const response = await axios.post(`${API_BASE_URL}${GENERATE_NONCE_ENDPOINT}`, {
      accountAddress: walletAddress,
      verifyType: "LOGIN",
      networkCode: "BSC",
    });

    if (response.data.code === "0") {
      return response.data.data;
    } else {
      throw new Error(`Failed to get nonce: ${response.data.msg || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error getting nonce:", error);
    throw error;
  }
}

/**
 * Login to the Fourmeme API
 *
 * @param wallet - The smart account wallet
 * @param nonce - The nonce generated from the API
 * @returns The access token
 */
async function login(wallet: ZeroXgaslessSmartAccount, nonce: string): Promise<string> {
  try {
    const walletAddress = await wallet.getAddress();
    const messageToSign = `You are sign in Meme ${nonce}`;

    // Sign the message with the wallet
    const signature = await wallet.signMessage(messageToSign);

    const response = await axios.post(`${API_BASE_URL}${LOGIN_ENDPOINT}`, {
      region: "WEB",
      langType: "EN",
      loginIp: "",
      inviteCode: "",
      verifyInfo: {
        address: walletAddress,
        networkCode: "BSC",
        signature,
        verifyType: "LOGIN",
      },
      walletName: "MetaMask",
    });

    if (response.data.code === "0") {
      return response.data.data;
    } else {
      throw new Error(`Failed to login: ${response.data.msg || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error logging in:", error);
    throw error;
  }
}

/**
 * Upload a token image to the Fourmeme platform
 *
 * @param accessToken - The access token obtained from login
 * @param imageFileBase64 - Base64 encoded image file content
 * @returns The URL of the uploaded image
 */
async function uploadTokenImage(accessToken: string, imageFileBase64: string): Promise<string> {
  try {
    // Convert base64 to file
    const binaryData = Buffer.from(imageFileBase64, "base64");

    const formData = new FormData();
    const blob = new Blob([binaryData]);
    formData.append("file", blob, "token-image.png");

    const response = await axios.post(`${API_BASE_URL}${UPLOAD_TOKEN_IMAGE_ENDPOINT}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        "meme-web-access": accessToken,
      },
    });

    if (response.data.code === "0") {
      return response.data.data;
    } else {
      throw new Error(`Failed to upload image: ${response.data.msg || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error uploading image:", error);
    throw error;
  }
}

/**
 * Create a token and get signature parameters
 *
 * @param accessToken - The access token obtained from login
 * @param params - The token creation parameters
 * @returns The token creation parameters and signature
 */
async function getTokenCreationParams(
  accessToken: string,
  params: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    launchTime: number;
    category: string;
    websiteUrl?: string;
    twitterUrl?: string;
    telegramUrl?: string;
    preSale?: string;
  },
): Promise<{ createArg: string; signature: string }> {
  try {
    // Fixed parameters as per the documentation
    const tokenParams = {
      name: params.name,
      shortName: params.symbol,
      desc: params.description,
      imgUrl: params.imageUrl,
      launchTime: params.launchTime,
      label: params.category,
      lpTradingFee: 0.0025, // Fixed as per docs
      webUrl: params.websiteUrl || "",
      twitterUrl: params.twitterUrl || "",
      telegramUrl: params.telegramUrl || "",
      preSale: params.preSale || "0",

      // Fixed parameters
      totalSupply: 1000000000,
      raisedAmount: 24,
      saleRate: 0.8,
      reserveRate: 0,
      funGroup: false,
      clickFun: false,
      symbol: "BNB",

      // Fixed raised token parameters
      raisedToken: {
        symbol: "BNB",
        nativeSymbol: "BNB",
        symbolAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
        deployCost: "0",
        buyFee: "0.01",
        sellFee: "0.01",
        minTradeFee: "0",
        b0Amount: "8",
        totalBAmount: "24",
        totalAmount: "1000000000",
        logoUrl:
          "https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png",
        tradeLevel: ["0.1", "0.5", "1"],
        status: "PUBLISH",
        buyTokenLink: "https://pancakeswap.finance/swap",
        reservedNumber: 10,
        saleRate: "0.8",
        networkCode: "BSC",
        platform: "MEME",
      },
    };

    const response = await axios.post(`${API_BASE_URL}${CREATE_TOKEN_ENDPOINT}`, tokenParams, {
      headers: {
        "meme-web-access": accessToken,
      },
    });

    if (response.data.code === "0") {
      return {
        createArg: response.data.data.createArg,
        signature: response.data.data.signature,
      };
    } else {
      throw new Error(`Failed to create token: ${response.data.msg || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error creating token:", error);
    throw error;
  }
}

/**
 * Create a new token on Fourmeme
 *
 * @param wallet - The smart account wallet
 * @param args - The token creation parameters
 * @returns A message with the transaction result
 */
export async function createFourmemeToken(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof CreateFourmemeTokenInput>,
): Promise<string> {
  try {
    // Validate that either imageUrl or imageFile is provided
    if (!args.imageUrl && !args.imageFile) {
      throw new Error("Either imageUrl or imageFile must be provided");
    }

    const walletAddress = await wallet.getAddress();

    // Step 1: Get nonce
    const nonce = await getNonce(walletAddress);
    console.log("Nonce obtained:", nonce);

    // Step 2: Login
    const accessToken = await login(wallet, nonce);
    console.log("Successfully logged in");

    // Step 3: Upload image if needed
    let imageUrl = args.imageUrl;
    if (!imageUrl && args.imageFile) {
      imageUrl = await uploadTokenImage(accessToken, args.imageFile);
      console.log("Image uploaded:", imageUrl);
    }

    if (!imageUrl) {
      throw new Error("No image URL or file provided");
    }

    // Step 4: Set launch time if not provided
    const launchTime = args.launchTime || Date.now() + 24 * 60 * 60 * 1000; // Default to 24 hours from now

    // Step 5: Get token creation parameters and signature
    const { createArg, signature } = await getTokenCreationParams(accessToken, {
      name: args.name,
      symbol: args.symbol,
      description: args.description,
      imageUrl,
      launchTime,
      category: args.category,
      websiteUrl: args.websiteUrl,
      twitterUrl: args.twitterUrl,
      telegramUrl: args.telegramUrl,
      preSale: args.preSale,
    });

    console.log("Token creation parameters obtained");

    // Step 6: Call the blockchain contract using viem
    const publicClient = createPublicClient({
      chain: bsc,
      transport: http(),
    });

    // Prepare hex strings for contract call
    const createArgHex = createArg.startsWith("0x") ? createArg : `0x${createArg}`;
    const signatureHex = signature.startsWith("0x") ? signature : `0x${signature}`;

    // Properly encode the function call data
    const data = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      [createArgHex as `0x${string}`, signatureHex as `0x${string}`],
    );

    // Send the transaction
    const txResponse = await wallet.sendTransaction({
      to: TOKEN_MANAGER2_ADDRESS,
      data,
      value: 0n,
    });

    console.log("Token creation transaction submitted:", txResponse);

    // Wait for transaction receipt
    // We need to handle the transaction hash format safely
    let txHashHex: `0x${string}`;
    if (typeof txResponse === "string") {
      const txString = txResponse as string;
      txHashHex = txString.startsWith("0x")
        ? (txString as `0x${string}`)
        : (`0x${txString}` as `0x${string}`);
    } else {
      // If it's a response object, stringify it for display
      return `Transaction submitted. Please check your wallet for confirmation.
Transaction Response: ${JSON.stringify(txResponse)}`;
    }

    // Wait for transaction to be confirmed
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHashHex,
    });

    // Parse events to get token address
    let tokenAddress = "Unknown";
    if (receipt.logs.length > 0) {
      try {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === TOKEN_MANAGER2_ADDRESS.toLowerCase()) {
            try {
              const decodedLog = decodeEventLog({
                abi: TOKEN_MANAGER2_ABI,
                data: log.data,
                topics: log.topics,
              });

              if (decodedLog.eventName === "TokenCreate") {
                tokenAddress = decodedLog.args.token;
                break;
              }
            } catch (_) {
              // Skip this log if we can't decode it
              continue;
            }
          }
        }
      } catch (error) {
        console.error("Error parsing event logs:", error);
      }
    }

    return `Successfully created token:
Token Address: ${tokenAddress}
Token Name: ${args.name}
Token Symbol: ${args.symbol}
Transaction: ${typeof txResponse === "string" ? txResponse : JSON.stringify(txResponse)}`;
  } catch (error) {
    console.error("Error creating token:", error);
    return `Error creating token: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Create Fourmeme token action.
 */
export class CreateFourmemeTokenAction implements AgentkitAction<typeof CreateFourmemeTokenInput> {
  public name = "create_fourmeme_token";
  public description = CREATE_FOURMEME_TOKEN_PROMPT;
  public argsSchema = CreateFourmemeTokenInput;
  public func = createFourmemeToken;
  public smartAccountRequired = true;
}
