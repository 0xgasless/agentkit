import { createPublicClient, http } from "viem";

const RPC_URL = "https://services.datahaven-testnet.network/testnet";

async function checkChain() {
  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  try {
    const chainId = await client.getChainId();
    console.log(`Chain ID: ${chainId}`);
    
    const blockNumber = await client.getBlockNumber();
    console.log(`Block Number: ${blockNumber}`);
    
  } catch (error) {
    console.error("RPC Error:", error);
  }
}

checkChain();
