import { Agentkit } from "../agentkit";
import dotenv from "dotenv";
import { getAllAgentkitActions } from "../actions";
import { DebridgeSwapAction } from "../actions/swapActionDebridge";

dotenv.config();

async function testDebridgeSwap() {
    try {
        console.log("Config:", {
            hasPrivateKey: !!process.env.PRIVATE_KEY,
            hasApiKey: !!process.env.API_KEY,
            chainId: process.env.CHAIN_ID || 8453,
        });

        // Initialize Agentkit
        const agentkit = await Agentkit.configureWithWallet({
            privateKey: process.env.PRIVATE_KEY as `0x${string}`,
            rpcUrl: process.env.RPC_URL as string,
            apiKey: process.env.API_KEY as string,
            chainID: Number(process.env.CHAIN_ID) || 8453,
        });

        // Get wallet address
        console.log("\nGetting wallet address:");
        const actions = getAllAgentkitActions();
        const addressAction = actions.find(a => a.name === "get_address");
        if (!addressAction) {
            throw new Error("get_address action not found");
        }
        const address = await agentkit.run(addressAction, addressAction.argsSchema.parse({}));
        console.log("Wallet address:", address);

        // Check if DeBridge action exists
        const debridgeAction = actions.find(a => a.name === "debridge_swap");
        if (!debridgeAction) {
            console.log("\nDeBridge Swap action not found in getAllAgentkitActions()");
            console.log("Testing standalone DeBridge action instead");
            
            // Create the action directly
            const standaloneAction = new DebridgeSwapAction();
            console.log("DeBridge action name:", standaloneAction.name);
            console.log("Schema available:", !!standaloneAction.argsSchema);
            console.log("Function available:", !!standaloneAction.func);
            
            // Show supported parameters
            const schemaShape = standaloneAction.argsSchema._def.shape();
            console.log("\nSupported parameters:");
            Object.keys(schemaShape).forEach(key => {
                console.log(`- ${key}`);
            });
            
            // Don't actually execute the swap in test mode
            console.log("\nTest successful - DeBridge action is properly defined");
            return;
        }

        // Check BNB Chain USDT balance
        console.log("\nChecking USDT balance on BNB Chain (before swap):");
        const bnbUsdtAddress = "0x55d398326f99059fF775485246999027B3197955"; // USDT on BNB Chain
        const bnbBalanceAction = actions.find(a => a.name === "get_balance");
        if (bnbBalanceAction) {
            try {
                // Store original chain ID
                const originalChainId = Number(process.env.CHAIN_ID) || 8453;
                
                // Create temporary agentkit instance for BNB Chain
                const tempBnbAgentkit = await Agentkit.configureWithWallet({
                    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
                    rpcUrl: "https://bsc-dataseed.binance.org", // BNB Chain RPC
                    apiKey: process.env.API_KEY as string,
                    chainID: 56, // BNB Chain
                });
                
                const bnbUsdtBalance = await tempBnbAgentkit.run(
                    bnbBalanceAction, 
                    bnbBalanceAction.argsSchema.parse({
                        tokenAddresses: [bnbUsdtAddress]
                    })
                );
                console.log("BNB Chain USDT Balance:", bnbUsdtBalance);
                
                // Reset back to original chain
                await Agentkit.configureWithWallet({
                    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
                    rpcUrl: process.env.RPC_URL as string,
                    apiKey: process.env.API_KEY as string,
                    chainID: originalChainId,
                });
            } catch (error) {
                console.error("Error checking BNB Chain USDT balance:", error);
            }
        }
        
        // Check Avalanche USDT balance
        console.log("\nChecking USDT balance on Avalanche (before swap):");
        const avaxUsdtAddress = "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7"; // USDT on Avalanche
        const avaxBalanceAction = actions.find(a => a.name === "get_balance");
        if (avaxBalanceAction) {
            try {
                // Store original chain ID
                const originalChainId = Number(process.env.CHAIN_ID) || 8453;
                
                // Create temporary agentkit instance for Avalanche
                const tempAvaxAgentkit = await Agentkit.configureWithWallet({
                    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
                    rpcUrl: "https://api.avax.network/ext/bc/C/rpc", // Avalanche RPC
                    apiKey: process.env.API_KEY as string,
                    chainID: 43114, // Avalanche
                });
                
                const avaxUsdtBalance = await tempAvaxAgentkit.run(
                    avaxBalanceAction, 
                    avaxBalanceAction.argsSchema.parse({
                        tokenAddresses: [avaxUsdtAddress]
                    })
                );
                console.log("Avalanche USDT Balance:", avaxUsdtBalance);
                
                // Reset back to original chain
                await Agentkit.configureWithWallet({
                    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
                    rpcUrl: process.env.RPC_URL as string,
                    apiKey: process.env.API_KEY as string,
                    chainID: originalChainId,
                });
            } catch (error) {
                console.error("Error checking Avalanche USDT balance:", error);
            }
        }

        // Check general balances before swap
        console.log("\nChecking balances on current chain before swap:");
        const balanceAction = actions.find(a => a.name === "get_balance");
        if (!balanceAction) {
            throw new Error("get_balance action not found");
        }
        const beforeBalances = await agentkit.run(balanceAction, balanceAction.argsSchema.parse({}));
        console.log("Before swap balances:", beforeBalances);

        // Test DeBridge swap
        console.log("\nTesting DeBridge swap (execute with caution):");
        console.log("CAUTION: This will attempt a real cross-chain swap if uncommented!");
        
        // Uncomment to perform an actual swap (USE WITH CAUTION)
        const swapResult = await agentkit.run(
            debridgeAction,
            debridgeAction.argsSchema.parse({
                srcChainTokenIn: "USDT",
                srcChainTokenInAmount: "1", 
                dstChainTokenOut: "WAVAX",
                dstChainTokenOutAmount: "auto",
                dstChainTokenOutRecipient: "0x37E89f2b337c39188d6B6e6535E644326d779193",
                srcChainId: 43114,  // Avalanche
                dstChainId: 43114,  // Must explicitly set destination chain ID
                wait: true,
                affiliateFeePercent: 0
            })
        );
        console.log("Swap result:", swapResult);
        
        // Check balances after swap
        // Wait a bit for the swap to complete
        // console.log("Waiting 30 seconds for swap to complete...");
        // await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Check BNB Chain USDT balance after swap
        // console.log("\nChecking USDT balance on BNB Chain (after swap):");
        // (Code to check BNB Chain balance again)
        
        // Check Avalanche USDT balance after swap  
        // console.log("\nChecking USDT balance on Avalanche (after swap):");
        // (Code to check Avalanche balance again)
        
        // console.log("Swap test skipped - uncomment code to execute real swap");

    } catch (error) {
        console.error("Test failed:", error);
    }
}

// Run tests
testDebridgeSwap(); 