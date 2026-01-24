import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

const RUN_TERMINAL_COMMAND_PROMPT = `
This tool executes a shell command in the terminal.
It allows you to install packages, build projects, or run arbitrary CLI tools.
Use this for setup tasks that don't have a dedicated action.

Required parameters:
- command: The shell command to execute (e.g., "npm install", "bun run build").

Optional parameters:
- cwd: The working directory for the command. Defaults to the workspace root.
`;

export const RunTerminalCommandInput = z
  .object({
    command: z.string().describe("The shell command to execute"),
    cwd: z.string().optional().describe("Working directory for command execution"),
  })
  .strip()
  .describe("Instructions for running a terminal command");

async function runTerminalCommand(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof RunTerminalCommandInput>,
): Promise<string> {
  try {
    const cwd = args.cwd || path.resolve(__dirname, "../../../../../"); // Fallback to workspace root
    
    console.log(`[RunTerminalCommand] Executing: '${args.command}' in ${cwd}`);
    
    // Safety check: Filter out obviously dangerous commands if needed (e.g. rm -rf /)
    // But for a dev tool agent, we want maximum flexibility as requested ("everything dynamic")
    
    const { stdout, stderr } = await execAsync(args.command, { cwd });

    return `
Command Executed Successfully.
Command: ${args.command}
Directory: ${cwd}

--- stdout ---
${stdout}
--- stderr ---
${stderr}
    `;

  } catch (error: any) {
    return `
Error executing command:
Command: ${args.command}
Error: ${error.message}
Stderr: ${error.stderr}
Stdout: ${error.stdout}
    `;
  }
}

export class RunTerminalCommandAction implements AgentkitAction<typeof RunTerminalCommandInput> {
  public name = "run_terminal_command";
  public description = RUN_TERMINAL_COMMAND_PROMPT;
  public argsSchema = RunTerminalCommandInput;
  public func = runTerminalCommand;
  public smartAccountRequired = false;
}
