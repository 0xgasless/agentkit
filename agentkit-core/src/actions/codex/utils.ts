import axios from "axios";

export function createCodexClient() {
    return axios.create({
        baseURL: "https://graph.codex.io/graphql",
        headers: {
            "Authorization": process.env.CODEX_API_KEY,
            "Content-Type": "application/json",
        },
    });
}

export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `Error analyzing data: ${error.message}`;
    }
    return "Unknown error occurred during data analysis";
} 