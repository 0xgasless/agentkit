import { ethers } from "hardhat";

// ViaLabs chain configs from @vialabs-io/npm-registry
const CHAIN_CONFIGS: Record<number, {
  name: string;
  message: string;
  feeToken: string;
  weth: string;
}> = {
  43113: { // Avalanche Fuji
    name: "avalanche-testnet",
    message: "0x8f92F60ffFB05d8c64E755e54A216090D8D6Eaf9",
    feeToken: "0x5425890298aed601595a70ab815c96711a31bc65",
    weth: "0xD59A1806BAa7f46d1e07A07649784fA682708794",
  },
  84532: { // Base Sepolia
    name: "base-testnet",
    message: "0xE700Ee5d8B7dEc62987849356821731591c048cF",
    feeToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    weth: "0x32D9c1DA01F221aa0eab4A0771Aaa8E2344ECd35",
  },
};

// Update these addresses after deploying to both chains
const DEPLOYMENTS: Record<number, string> = {
  43113: "0xc8600dE63d7cbA25967ecf4894be84dB1c9Ee137", // Avalanche Fuji (v2 with MESSAGE_OWNER)
  84532: "0xb9dB93d419bEDc2C20fe39248D560E7CB1aAABD0", // Base Sepolia (v2 with MESSAGE_OWNER)
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const currentChainId = Number(network.chainId);
  
  console.log("=== Configuring cross-chain for HelloERC20 ===");
  console.log("Network:", network.name, "Chain ID:", currentChainId);
  console.log("Deployer:", deployer.address);
  
  const chainConfig = CHAIN_CONFIGS[currentChainId];
  if (!chainConfig) {
    console.error(`Chain ${currentChainId} not supported`);
    return;
  }
  
  // Get current chain's contract address
  const currentAddress = DEPLOYMENTS[currentChainId];
  if (!currentAddress) {
    console.error(`❌ No deployment found for chain ${currentChainId}`);
    console.log("Please update DEPLOYMENTS in this script with the contract addresses");
    return;
  }
  
  // Connect to the contract
  const HelloERC20 = await ethers.getContractFactory("HelloERC20");
  const token = HelloERC20.attach(currentAddress);
  
  console.log("Connected to HelloERC20 at:", currentAddress);
  console.log("Using MessageV3:", chainConfig.message);
  
  // Collect all other chains for configuration
  const otherChainIds: number[] = [];
  const otherEndpoints: string[] = [];
  const confirmations: number[] = [];
  
  for (const [chainId, address] of Object.entries(DEPLOYMENTS)) {
    const destChainId = Number(chainId);
    
    if (destChainId === currentChainId) continue;
    if (!address) {
      console.log(`⚠️ Skipping chain ${destChainId} - no address configured`);
      continue;
    }
    
    otherChainIds.push(destChainId);
    otherEndpoints.push(address);
    confirmations.push(1); // 1 block confirmation for testnets
    
    console.log(`Adding chain ${destChainId}: ${address}`);
  }
  
  if (otherChainIds.length === 0) {
    console.error("No other chains to configure. Deploy to at least 2 chains first.");
    return;
  }
  
  console.log("\nConfiguring cross-chain messaging...");
  console.log("MessageV3:", chainConfig.message);
  console.log("Other chains:", otherChainIds);
  console.log("Other endpoints:", otherEndpoints);
  console.log("Confirmations:", confirmations);
  
  try {
    // Call configureClient inherited from MessageClient
    const tx = await token.configureClient(
      chainConfig.message, // MessageV3 bridge address
      otherChainIds,        // destination chain IDs
      otherEndpoints,       // corresponding HelloERC20 addresses
      confirmations         // required confirmations
    );
    
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    await tx.wait();
    console.log("✅ Cross-chain configuration complete!");
    
    // Verify configuration
    console.log("\nVerifying chain configs:");
    for (let i = 0; i < otherChainIds.length; i++) {
      const isActive = await token.isChainActive(otherChainIds[i]);
      console.log(`  Chain ${otherChainIds[i]}: active=${isActive}`);
    }
  } catch (error) {
    console.error("Error configuring cross-chain:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
