import { z } from "zod";
import { AgentkitAction } from "../agentkit";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";

const SXT_SQL_PROMPT = `
Executes a **read-only ANSI-SQL query** against the Space and Time Managed DB via the public proxy endpoint.

USAGE
  name   : execute_sxt_sql
  args   :
    • sqlText (string, required) – Full SQL statement to execute.

SUPPORTED SQL FEATURES
  • Standard DQL / SELECT statements.
  • WHERE, JOIN (INNER/LEFT/RIGHT/FULL), GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET.
  • Aggregate functions – COUNT, SUM, AVG, MIN, MAX, etc.
  • Window functions and sub-queries.
  • Date helpers such as current_date, DATE_ADD, DATE_DIFF, etc.

LIMITATIONS
  • Read-only: INSERT, UPDATE, DELETE, CREATE, DROP, ALTER and other DML/DDL statements are NOT allowed.
  • Each call must include a valid SXT_API_KEY environment variable – if absent the tool will return an error instructing you to set it.

DATASETS
  • Public blockchain tables e.g. bitcoin.transactions, eth.dex_trade, polygon.blocks …
  • Any private tables you have ingested into your Space and Time tenant.

RETURNS
  • JSON array of result rows on success.
  • Error message on failure (e.g., invalid SQL or missing API key).

EXAMPLES
  SELECT COUNT(*)
  FROM bitcoin.transactions
  WHERE time_stamp BETWEEN current_date-3 AND current_date+1;

  SELECT exchange_name, COUNT(*)
  FROM eth.dex_trade
  GROUP BY exchange_name
  ORDER BY 2 DESC
  LIMIT 10;
`;

export const SxtSqlInput = z.object({
  sqlText: z.string().describe("The SQL query to execute."),
});

export async function executeSxtSql(
  _wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SxtSqlInput>,
): Promise<string> {
  const apiKey = process.env.SXT_API_KEY;

  if (!apiKey) {
    return "Error: SXT_API_KEY environment variable not set. Please set it and try again.";
  }

  try {
    const response = await fetch("https://proxy.api.makeinfinite.dev/v1/sql", {
      method: "POST",
      headers: {
        accept: "application/json",
        apikey: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sqlText: args.sqlText,
      }),
    });

    const responseBody = await response.text();

    if (!response.ok) {
      let errorDetails = responseBody;
      try {
        errorDetails = JSON.stringify(JSON.parse(responseBody), null, 2);
      } catch (_e) {
        // Not a JSON response, use the raw text
      }
      return `Error from Space and Time API: ${response.status} ${response.statusText}\n${errorDetails}`;
    }

    try {
      return JSON.stringify(JSON.parse(responseBody), null, 2);
    } catch (_e) {
      return responseBody;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return `Error executing SQL query: ${errorMessage}`;
  }
}

export class SxtAction implements AgentkitAction<typeof SxtSqlInput> {
  public name = "execute_sxt_sql";
  public description = SXT_SQL_PROMPT;
  public argsSchema = SxtSqlInput;
  public func = executeSxtSql;
  public smartAccountRequired = false;
}
