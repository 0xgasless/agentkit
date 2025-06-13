import { z } from "zod";
import { type AgentkitAction } from "../agentkit";
import {
  generateNewViemPrivateKey,
  getAddressFromPrivateKey,
  storeKey as storeKeyInDb,
} from "../services/keyManagementService";

export const CREATE_AND_STORE_KEY_PROMPT = `
This tool generates a new Ethereum private key and returns the associated wallet address.
If in a Node.js/Bun environment, the key is stored locally in a SQLite database (keys.db);
this does not occur in browser environments. The private key itself is not returned by the action.
`;

export const CreateAndStoreKeyArgsSchema = z.object({});
export type CreateAndStoreKeyArgs = z.infer<typeof CreateAndStoreKeyArgsSchema>;

export class CreateAndStoreKeyAction implements AgentkitAction<typeof CreateAndStoreKeyArgsSchema> {
  public name = "create_and_store_key";
  public description = CREATE_AND_STORE_KEY_PROMPT;
  public argsSchema = CreateAndStoreKeyArgsSchema;
  public smartAccountRequired = false;

  public async func(_args: CreateAndStoreKeyArgs): Promise<string> {
    try {
      const privateKey = generateNewViemPrivateKey();
      const walletAddress = getAddressFromPrivateKey(privateKey);

      // Attempt to store the key. storeKeyInDb handles environment check.
      const stored = await storeKeyInDb(walletAddress, privateKey);
      if (stored) {
        console.log(`CreateAndStoreKeyAction: Key for ${walletAddress} stored successfully.`);
      } else {
        // This can mean it's a browser environment or DB storing failed in Node.
        // The keyManagementService logs details for Node failures.
        console.log(
          `CreateAndStoreKeyAction: Key for ${walletAddress} not stored to DB (may be browser environment or DB error).`,
        );
      }

      return JSON.stringify({ walletAddress });
    } catch (error) {
      console.error("Error in CreateAndStoreKeyAction:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: `Failed to create and store key: ${errorMessage}` });
    }
  }
}
