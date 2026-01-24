import { ApiPromise, WsProvider } from '@polkadot/api';
import '@storagehub/api-augment';

// Correct WSS URL
const WSS_URL = "wss://services.datahaven-testnet.network/testnet";

async function inspect() {
  console.log(`Connecting to ${WSS_URL}...`);
  const provider = new WsProvider(WSS_URL);
  const api = await ApiPromise.create({ provider });

  console.log("Connected! Listing available pallets (modules):");
  
  const pallets = Object.keys(api.tx).sort();
  console.log("Pallets:", pallets.join(", "));
  
  for (const pallet of pallets) {
    if (pallet.toLowerCase().includes('provider') || pallet.toLowerCase().includes('file') || pallet.toLowerCase().includes('storage')) {
      console.log(`\n--- Extrinsics for Module: ${pallet} ---`);
      const methods = Object.keys(api.tx[pallet]).sort();
      methods.forEach(method => {
        console.log(`  ${method}`);
      });
    }
  }
  
  // Also check query methods to confirm module names
  console.log("\n--- Query Modules ---");
  const queryModules = Object.keys(api.query).sort();
  console.log(queryModules.join(", "));

  await api.disconnect();
}

inspect().catch(console.error);
