<div align="center">
  <p>
    <a href="https://docs.0xgasless.com/docs">
      <img src="https://fwcsgvyqmolgmbupulmv.supabase.co/storage/v1/object/public/common/repo-banner.png" alt="0xGasless AgentKit" />
    </a>
  </p>
  <h1>0xGasless AgentKit</h1>
  <p>A powerful toolkit for gasless transactions and account abstraction on EVM chains.</p>
</div>

## Features

- 🌟 **Gasless Transactions**: Execute transactions without holding native tokens
- 🔐 **Account Abstraction**: Built on ERC-4337 standard
- 💱 **Token Operations**: Transfers, swaps, and deployments without gas fees
- 🔄 **Multi-Chain Support**: Works across major EVM chains
- 🤖 **AI Integration**: Built-in LangChain compatibility

## Supported Networks

- Base (8453)
- Fantom (250)
- Moonbeam (1284)
- Avalanche (43114)
- BSC (56)
- 

## Installation

Using bun:

```bash
bun add @0xgasless/agentkit
```

```typescript
import { Agentkit, LangchainAgentkitToolkit } from "@0xgasless/agentkit";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

function validateEnvironment(): void {
  const missingVars: string[] = [];

  const requiredVars = ["OPENROUTER_API_KEY", "PRIVATE_KEY", "RPC_URL", "API_KEY", "CHAIN_ID"];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach(varName => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  if (!process.env.CHAIN_ID) {
    console.warn("Warning: CHAIN_ID not set, defaulting to base-sepolia");
  }
}

validateEnvironment();

async function initializeAgent() {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o",
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    });

    // Initialize 0xGasless AgentKit
    const agentkit = await Agentkit.configureWithWallet({
      privateKey: process.env.PRIVATE_KEY as `0x${string}`,
      rpcUrl: process.env.RPC_URL,
      apiKey: process.env.API_KEY as string,
      chainID: Number(process.env.CHAIN_ID) || 8453, // Base Sepolia
    });

    // Initialize AgentKit Toolkit and get tools
    const agentkitToolkit = new LangchainAgentkitToolkit(agentkit);
    const tools = agentkitToolkit.getTools();

    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: "0xGasless AgentKit Chatbot Example!" } };

    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with EVM chains using 0xGasless smart accounts. You can perform 
        gasless transactions using the account abstraction wallet. You can check balances of ETH and any ERC20 token 
        by providing their contract address. If someone asks you to do something you can't do with your currently 
        available tools, you must say so. Be concise and helpful with your responses.
      `,
    });

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

// For runAutonomousMode, runChatMode, chooseMode and main functions, reference:

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */

//biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log("Starting autonomous mode...");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const thought =
        "Be creative and do something interesting on the blockchain. " +
        "Choose an action or set of actions and execute it that highlights your abilities.";

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

/**
 * Run the agent interactively based on user input
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 */
//biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  try {
    while (true) {
      const userInput = await question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Choose whether to run in autonomous or chat mode based on user input
 *
 * @returns Selected mode
 */
async function chooseMode(): Promise<"chat" | "auto"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log("\nAvailable modes:");
    console.log("1. chat    - Interactive chat mode");
    console.log("2. auto    - Autonomous action mode");

    const choice = (await question("\nChoose a mode (enter number or name): "))
      .toLowerCase()
      .trim();

    if (choice === "1" || choice === "chat") {
      rl.close();
      return "chat";
    } else if (choice === "2" || choice === "auto") {
      rl.close();
      return "auto";
    }
    console.log("Invalid choice. Please try again.");
  }
}

/**
 * Start the chatbot agent
 */
async function main() {
  try {
    const { agent, config } = await initializeAgent();
    const mode = await chooseMode();

    if (mode === "chat") {
    await runChatMode(agent, config);
    } else {
      await runAutonomousMode(agent, config);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  console.log("Starting Agent...");
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}


```

## Available Actions

- `GetBalanceAction`: Check ETH and token balances
- `SmartTransferAction`: Transfer tokens gaslessly
- `SwapAction`: Perform token swaps without gas
- `DeploySmartTokenAction`: Deploy new ERC20 tokens

## Documentation

- [AgentKit Documentation](https://docs.0xgasless.com/docs)

## License

Apache-2.0
