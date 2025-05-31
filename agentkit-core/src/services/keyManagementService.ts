import { generatePrivateKey as viemGeneratePrivateKey, privateKeyToAccount } from "viem/accounts";
import path from "path";
// import { EOL } from 'os'; // EOL not strictly needed for console.log, removing for now

// Determine if running in a Node.js-like environment
const isNodeLikeEnvironment =
  typeof process !== "undefined" && process.versions != null && process.versions.node != null;

// Dynamically imported sqlite3 types and instance
let sqlite3Module: unknown = null; // To hold the imported sqlite3 module itself
let SqliteDatabaseConstructor: unknown = null; // To hold the Database constructor from the module

// Database path: agentkit/keys.db (workspace root)
const DB_FILE_PATH = path.resolve(process.cwd(), "keys.db");

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
let dbInstanceInternal: any | null = null; // Will be an instance of SqliteDatabaseConstructor in Node
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
let dbInitializationPromiseInternal: Promise<any | null> | null = null;

async function loadSqlite3IfNotLoaded(): Promise<void> {
  if (!isNodeLikeEnvironment || sqlite3Module) return;
  try {
    const importedModule = await import("sqlite3");
    sqlite3Module = importedModule.default || importedModule;
    if (
      typeof sqlite3Module === "object" &&
      sqlite3Module !== null &&
      "Database" in sqlite3Module
    ) {
      SqliteDatabaseConstructor = (sqlite3Module as { Database: unknown }).Database;
    } else {
      console.warn("SQLite3 Database constructor not found on the imported module.");
      SqliteDatabaseConstructor = null;
      sqlite3Module = null;
    }
    if (SqliteDatabaseConstructor) {
      console.log("SQLite3 module and Database constructor loaded successfully.");
    } else if (sqlite3Module) {
      console.warn("SQLite3 module loaded, but Database constructor could not be identified.");
    }
  } catch (e) {
    console.warn(
      "Failed to load sqlite3 module. Key storage will be disabled.",
      e instanceof Error ? e.message : String(e),
    );
    sqlite3Module = null;
    SqliteDatabaseConstructor = null;
  }
}

// Initialize SQLite and ensure table exists (Node.js only)
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function getKeystoreDB(): Promise<any | null> {
  // Returns Promise<sqlite3.Database | null>
  if (!isNodeLikeEnvironment) {
    return null;
  }
  if (!sqlite3Module || !SqliteDatabaseConstructor) {
    await loadSqlite3IfNotLoaded();
    if (!sqlite3Module || !SqliteDatabaseConstructor) {
      console.warn("SQLite3 not available after load attempt. Cannot get DB instance.");
      return null;
    }
  }

  if (dbInstanceInternal) {
    return Promise.resolve(dbInstanceInternal);
  }
  if (dbInitializationPromiseInternal) {
    return dbInitializationPromiseInternal;
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dbInitializationPromiseInternal = new Promise<any | null>((resolve, reject) => {
    // Type assertion for the constructor
    const DbConstructor = SqliteDatabaseConstructor as new (
      path: string,
      callback: (err: Error | null) => void,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ) => any;
    if (!DbConstructor) {
      const err = new Error("SQLite Database constructor is not available.");
      console.error(err.message);
      dbInitializationPromiseInternal = null;
      return reject(err);
    }
    try {
      const newDb = new DbConstructor(DB_FILE_PATH, (err: Error | null) => {
        if (err) {
          console.error(`Error opening database at ${DB_FILE_PATH}:`, err.message);
          dbInitializationPromiseInternal = null;
          return reject(err);
        }
        console.log(`Connected to the SQLite database: ${DB_FILE_PATH}`);
        newDb.run(
          `CREATE TABLE IF NOT EXISTS keystore (
          address TEXT PRIMARY KEY,
          private_key TEXT NOT NULL
        )`,
          (createTableErr: Error | null) => {
            if (createTableErr) {
              console.error("Error creating keystore table:", createTableErr.message);
              newDb.close((closeErr: Error | null) => {
                if (closeErr)
                  console.error("Error closing DB after table creation failure:", closeErr.message);
              });
              dbInitializationPromiseInternal = null;
              return reject(createTableErr);
            }
            console.log("Keystore table created or already exists.");
            dbInstanceInternal = newDb;
            resolve(dbInstanceInternal);
          },
        );
      });
    } catch (constructorError) {
      // Catch errors from `new DbConstructor` itself if it's not a valid constructor
      console.error("Error instantiating SQLite Database:", constructorError);
      dbInitializationPromiseInternal = null;
      reject(constructorError);
    }
  }).catch(err => {
    dbInitializationPromiseInternal = null;
    throw err;
  });

  return dbInitializationPromiseInternal;
}

// Store private key (Node.js only)
export async function storeKey(address: string, privateKey: `0x${string}`): Promise<boolean> {
  if (!isNodeLikeEnvironment) return false;

  const db = await getKeystoreDB();
  if (!db) {
    console.warn("DB not available, cannot store key.");
    return false;
  }

  return new Promise<boolean>((resolve, reject) => {
    const sql = `INSERT OR REPLACE INTO keystore (address, private_key) VALUES (?, ?)`;
    // Define the type for 'this' context for sqlite3.run callback
    interface SqliteRunCallbackContext {
      lastID: number;
      changes: number;
    }
    db.run(
      sql,
      [address, privateKey],
      function (this: SqliteRunCallbackContext, err: Error | null) {
        if (err) {
          console.error("Error storing key:", err.message);
          return reject(err);
        }
        console.log(`Key for address ${address} stored/updated. Rows: ${this.changes}`);
        resolve(true);
      },
    );
  });
}

// Retrieve stored private key by address (Node.js only)
export async function getStoredPrivateKeyByAddress(address: string): Promise<`0x${string}` | null> {
  if (!isNodeLikeEnvironment) return null;

  const db = await getKeystoreDB();
  if (!db) return null;

  return new Promise<`0x${string}` | null>((resolve, reject) => {
    const sql = `SELECT private_key FROM keystore WHERE address = ?`;
    db.get(sql, [address], (err: Error | null, row: { private_key: `0x${string}` } | undefined) => {
      if (err) {
        console.error("Error retrieving key:", err.message);
        return reject(err);
      }
      resolve(row?.private_key || null);
    });
  });
}

// Generate a new private key using viem
export function generateNewViemPrivateKey(): `0x${string}` {
  return viemGeneratePrivateKey();
}

// Get address from a private key using viem
export function getAddressFromPrivateKey(privateKey: `0x${string}`): string {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

// Attempt to load sqlite3 when service is initialized in Node.js environment
if (isNodeLikeEnvironment) {
  // Fire and forget, errors handled internally
  loadSqlite3IfNotLoaded().catch(err => {
    console.warn(
      "Initial attempt to load sqlite3 failed on module load:",
      err instanceof Error ? err.message : String(err),
    );
  });
}
