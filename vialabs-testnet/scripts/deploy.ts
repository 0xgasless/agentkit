import { ethers } from "hardhat";

// ViaLabs chain configs from @vialabs-io/npm-registry
const CHAIN_CONFIGS: Record<number, {
  name: string;
  message: string; // MessageV3 contract address
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

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  console.log("=== Deploying HelloERC20 with ViaLabs MessageClient ===");
  console.log("Network:", network.name, "Chain ID:", chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "native");

  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    console.error(`Chain ${chainId} not supported`);
    return;
  }
  console.log("Chain config:", chainConfig.name);
  console.log("MessageV3 address:", chainConfig.message);

  const HelloERC20 = await ethers.getContractFactory("HelloERC20");
  const token = await HelloERC20.deploy();
  
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  
  console.log("\n✅ HelloERC20 deployed to:", tokenAddress);
  
  // Log deployment info
  const deploymentInfo = {
    chainId: chainId,
    network: chainConfig.name,
    contractAddress: tokenAddress,
    messageV3: chainConfig.message,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  
  console.log("\nDeployment info:", JSON.stringify(deploymentInfo, null, 2));
  console.log("\nNext steps:");
  console.log("1. Deploy to the other chain");
  console.log("2. Run the configure script to set up cross-chain messaging");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
