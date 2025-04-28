import type { Config } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

// Parse connection string (simple version)
const url = new URL(process.env.DATABASE_URL);
const hostParts = url.host.split(':');
const host = hostParts[0] || 'localhost'; // Provide a default value
const port = hostParts[1] ? Number.parseInt(hostParts[1]) : 5432;
const database = url.pathname.substring(1);
const user = url.username;
const password = url.password;

export default {
    schema: "src/db/schema.ts", // Path to your schema
    out: "./drizzle",             // Path for migrations
    dialect: "postgresql",
    dbCredentials: {
        host,
        port,
        user,
        password,
        database,
        ssl: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    },
    // For older versions of drizzle-kit that use this format:
    // postgres: {
    //   ssl: { rejectUnauthorized: false }
    // }
} satisfies Config;