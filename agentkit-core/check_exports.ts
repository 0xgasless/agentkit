import * as core from '@storagehub-sdk/core';

console.log("Exported Keys:", Object.keys(core));

for (const key of Object.keys(core)) {
  const Val = (core as any)[key];
  if (typeof Val === 'string') {
    console.log(`String export: ${key} = ${Val}`);
  }
}

// Check if there is a likely candidate for contract address
console.log("\nSearching for 'Address' in exports...");
for (const key of Object.keys(core)) {
  if (key.toLowerCase().includes('address')) {
     console.log(`Found: ${key} = ${(core as any)[key]}`);
  }
}

// Check StorageHubClientOptions interface if possible? No, runtime only.
// Check if StorageHubClient has length (constructor args count)
console.log("StorageHubClient length:", core.StorageHubClient ? core.StorageHubClient.length : "N/A");
