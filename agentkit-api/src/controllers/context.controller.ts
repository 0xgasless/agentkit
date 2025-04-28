import type { Request, Response } from "express";
import { db } from "../db/drizzle";
import { contexts } from "../db/schema";
import { eq } from "drizzle-orm";

export const createContext = async (req: Request, res: Response) => {
	try {
		const { contract_address, abi, description, tags, chainId, network } =
			req.body;

		const result = await db
			.insert(contexts)
			.values({
				contract_address,
				abi,
				description,
				tags,
				chain_id: chainId,
				network,
			})
			.returning();

		res.status(201).json(result[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Failed to create context" });
	}
};

export const getContext = async (req: Request, res: Response) => {
	try {
		const { contract_address, chainId } = req.query;

		if (!contract_address || !chainId) {
			return res.status(400).json({ message: "Missing query parameters" });
		}

		const result = await db
			.select()
			.from(contexts)
			.where(
				eq(contexts.contract_address, contract_address as string) &&
					eq(contexts.chain_id, Number.parseInt(chainId as string)),
			);

		if (result.length === 0) {
			return res.status(404).json({ message: "Context not found" });
		}

		res.status(200).json(result[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: "Failed to fetch context" });
	}
};
