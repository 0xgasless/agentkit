import { Agentkit } from "./agentkit";
import dotenv from "dotenv";
import { getAllAgentkitActions } from "./actions";
import { UNISWAP_V3_ROUTER } from './uniswap';
import { encodeFunctionData } from "viem";
import { parseUnits } from "viem";
import { TokenABI } from "./constants";

dotenv.config();

async function testActions() {
    try {
        console.log("Config:", {
            hasPrivateKey: !!process.env.PRIVATE_KEY,
            hasApiKey: !!process.env.API_KEY,
            hasCmcApiKey: !!process.env.CMC_API_KEY,
        });

        // Initialize Agentkit
        const agentkit = await Agentkit.configureWithWallet({
            privateKey: process.env.PRIVATE_KEY as `0x${string}`,
            rpcUrl: process.env.RPC_URL as string,
            apiKey: process.env.API_KEY as string,
            chainID: Number(process.env.CHAIN_ID) || 8453,
            cmcApiKey: process.env.CMC_API_KEY as string,
        });

        // Get all actions
        const actions = getAllAgentkitActions();

        // Test get_address
        console.log("\nTesting get_address:");
        const addressResult = await agentkit.run(actions[5], actions[5].argsSchema.parse({}));
        console.log(addressResult);

        // Test get_balance
        console.log("\nTesting get_balance:");
        const balanceResult = await agentkit.run(actions[0], actions[0].argsSchema.parse({}));
        console.log(balanceResult);

        // Test token_analysis
        console.log("\nTesting token_analysis:");
        const analysisResult = await agentkit.run(
            actions[6],
            actions[6].argsSchema.parse({
                type: "listings",
                limit: 5,
            }),
        );
        console.log(analysisResult);

        // Test USDT and USDC balances before swap
        console.log("\nChecking balances before swap:");
        const beforeBalances = await agentkit.run(
            actions[0],
            actions[0].argsSchema.parse({
                tokenAddresses: [
                    "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT
                    "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"  // USDC
                ]
            })
        );
        console.log("Before swap balances:", beforeBalances);

        // Check USDT balance first
        console.log("\nChecking USDT balance before approval:");
        const usdtBalance = await agentkit.run(
            actions[0],
            actions[0].argsSchema.parse({
                tokenAddresses: ["0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7"] // USDT
            })
        );
        console.log("USDT Balance:", usdtBalance);

        // Approve USDT first
        console.log("\nApproving USDT...");
        const data = encodeFunctionData({
            abi: TokenABI,
            functionName: "approve",
            args: [
                UNISWAP_V3_ROUTER[43114],
                parseUnits("0.01", 6) // USDT has 6 decimals, reduced amount
            ],
        });

        const approveResult = await agentkit.run(
            actions[1], // SmartTransferAction
            actions[1].argsSchema.parse({
                tokenAddress: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT
                destination: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT contract
                amount: "0.01", // Reduced amount for testing
                data: data
            })
        );
        console.log("Approval result:", approveResult);

        // Wait for approval
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Then proceed with swap if approval successful
        if (!approveResult.includes("Error")) {
            console.log("\nTesting swap:");
            const swapResult = await agentkit.run(
                actions[2],
                actions[2].argsSchema.parse({
                    fromTokenAddress: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
                    toTokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
                    amount: "0.01",
                    slippageTolerance: 100
                })
            );
            console.log("Swap result:", swapResult);
        }

        // Wait for swap to be confirmed
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Test balances after swap
        console.log("\nChecking balances after swap:");
        const afterBalances = await agentkit.run(
            actions[0],
            actions[0].argsSchema.parse({
                tokenAddresses: [
                    "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", // USDT
                    "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"  // USDC
                ]
            })
        );
        console.log("After swap balances:", afterBalances);
    } catch (error) {
        console.error("Test failed:", error);
    }
}

// Run tests
testActions();

// "test": "bunx jest --no-cache --testMatch='**/*_test.ts'",
