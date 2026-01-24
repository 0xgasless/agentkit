import { createPublicClient, http } from "viem";

const RPC_URL = "https://services.datahaven-testnet.network/testnet";
const PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000064";

async function checkContract() {
  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  console.log(`Checking code at ${PRECOMPILE_ADDRESS}...`);
  const code = await client.getBytecode({ address: PRECOMPILE_ADDRESS });
  
  console.log(`Code result: ${code}`);
  
  if (!code || code === "0x") {
    console.log("❌ No code found at address! Precompile missing or RPC issue.");
  } else {
    console.log(`✅ Code found (${code.length} bytes). Contract exists.`);
  }
}

checkContract().catch(console.error);
