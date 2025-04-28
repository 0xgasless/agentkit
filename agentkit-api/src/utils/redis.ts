import { Redis } from "ioredis";
import { RedisByteStore } from "@langchain/community/storage/ioredis";

// Initialize Redis client and store
const client = new Redis(); // Use appropriate Redis configuration if needed

const store = new RedisByteStore({
	client,
});

// Encoder/decoder for strings and Uint8Arrays
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export { store, encoder, decoder };
