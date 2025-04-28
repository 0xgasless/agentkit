// src/db/schema.ts
import {
	pgTable,
	text,
	varchar,
	integer,
	serial,
	timestamp,
	json,
} from "drizzle-orm/pg-core";

export const contexts = pgTable("contexts", {
	id: serial("id").primaryKey(),
	contract_address: varchar("contract_address", { length: 100 }).notNull(),
	abi: json("abi").notNull(),
	description: text("description").notNull(),
	tags: text("tags").array().notNull(),
	chain_id: integer("chain_id").notNull(),
	network: varchar("network", { length: 50 }).notNull(),
	created_at: timestamp("created_at").defaultNow(),
});

// TypeScript type (optional for inference/autocomplete)
export type Context = typeof contexts.$inferSelect;
export type NewContext = typeof contexts.$inferInsert;
