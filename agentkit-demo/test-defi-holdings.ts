import "dotenv/config";
import { getDefiHoldings } from "@0xgasless/agentkit";

async function main() {
    const result = await getDefiHoldings(null as any, {
        wallet_address: "0x4062b997279de7213731dbe00485722a26718892",
    });
    console.log(result);
}

main().catch(console.error);
