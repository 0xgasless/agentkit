// import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
const { Agentkit, AgentkitToolkit } = require("@0xgasless/agentkit");
const { HumanMessage } = require("@langchain/core/messages");
const { MemorySaver } = require("@langchain/langgraph");
// import { MemorySaver } from "@langchain/langgraph";
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { ChatOpenAI } = require("@langchain/openai");
const dotenv = require("dotenv");
const readline = require("readline");

dotenv.config();

function validateEnvironment(): void {
  const missingVars: string[] = [];

  const requiredVars = ["OPENROUTER_API_KEY", "PRIVATE_KEY", "RPC_URL", "API_KEY", "CHAIN_ID", "CODEX_API_KEY"];

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
    console.log("Starting agent initialization...");
    
    // Check environment variables
    console.log("API Keys configured:", {
      openRouter: !!process.env.OPENROUTER_API_KEY,
      codex: !!process.env.CODEX_API_KEY,
      privateKey: !!process.env.PRIVATE_KEY,
      rpcUrl: !!process.env.RPC_URL,
      apiKey: !!process.env.API_KEY,
      chainId: process.env.CHAIN_ID
    });

    // Initialize OpenAI via OpenRouter with more verbose error handling
    console.log("Initializing LLM...");
    const llm = new ChatOpenAI({
      model: 'meta-llama/llama-2-70b-chat',
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        headers: {
          "HTTP-Referer": "https://agentkit.dev",
          "X-Title": "AgentKit Demo"
        },
      },
      temperature: 0.7,
      maxRetries: 3,
    });

    // Initialize 0xGasless AgentKit with verbose logging
    console.log("Configuring AgentKit with wallet...");
    let agentkit;
    try {
      agentkit = await Agentkit.configureWithWallet({
        privateKey: process.env.PRIVATE_KEY as `0x${string}`,
        rpcUrl: process.env.RPC_URL,
        apiKey: process.env.API_KEY as string,
        chainID: Number(process.env.CHAIN_ID) || 8453, 
        codexApiKey: process.env.CODEX_API_KEY as string,
      });
      console.log("AgentKit configured successfully");
    } catch (agentKitError) {
      console.error("AgentKit configuration failed:", agentKitError);
      throw agentKitError;
    }

    // Initialize toolkit and get tools
    console.log("Getting AgentKit tools...");
    const agentkitToolkit = new AgentkitToolkit(agentkit);
    const tools = agentkitToolkit.getTools();
    console.log(`Got ${tools.length} tools from toolkit`);
    
    // Log tool names to verify Codex tools are included
    console.log("Available tools:", tools.map(tool => tool.name));

    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: "0xGasless AgentKit Chatbot Example!" } };

    console.log("Creating React agent...");
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with EVM chains using 0xGasless smart accounts. You can perform 
        gasless transactions using the account abstraction wallet. You can check balances of ETH and any ERC20 token 
        by providing their contract address. You can analyze tokens and blockchain data using Codex API.
        If someone asks you to do something you can't do with your currently available tools, you must say so. 
        Be concise and helpful with your responses.
      `,
    });

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
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
// async function runAutonomousMode(agent: any, config: any, interval = 10) {
//   console.log("Starting autonomous mode...");

//   // eslint-disable-next-line no-constant-condition
//   while (true) {
//     try {
//       const thought =
//         "Be creative and do something interesting on the blockchain. " +
//         "Choose an action or set of actions and execute it that highlights your abilities.";

//       const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

//       for await (const chunk of stream) {
//         if ("agent" in chunk) {
//           console.log(chunk.agent.messages[0].content);
//         } else if ("tools" in chunk) {
//           console.log(chunk.tools.messages[0].content);
//         }
//         console.log("-------------------");
//       }

//       await new Promise(resolve => setTimeout(resolve, interval * 1000));
//     } catch (error) {
//       if (error instanceof Error) {
//         console.error("Error:", error.message);
//       }
//       process.exit(1);
//     }
//   }
// }

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

      console.log("Sending message to agent...");
      try {
        const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);
        console.log("Got response stream from agent");

        for await (const chunk of stream) {
          if ("agent" in chunk) {
            console.log("AGENT CHUNK:", chunk.agent.messages[0].content);
          } else if ("tools" in chunk) {
            console.log("TOOL CHUNK:", chunk.tools.messages[0].content);
          } else {
            console.log("UNKNOWN CHUNK:", chunk);
          }
          console.log("-------------------");
        }
      } catch (streamError) {
        console.error("Error streaming agent response:", streamError);
        if (streamError instanceof Error) {
          console.error("Stream error details:", {
            name: streamError.name,
            message: streamError.message,
            stack: streamError.stack
          });
        }
        console.log("Continuing to next prompt...");
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
// async function chooseMode(): Promise<"chat" | "auto"> {
//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
//   });

//   const question = (prompt: string): Promise<string> =>
//     new Promise(resolve => rl.question(prompt, resolve));

//   // eslint-disable-next-line no-constant-condition
//   while (true) {
//     console.log("\nAvailable modes:");
//     console.log("1. chat    - Interactive chat mode");
//     console.log("2. auto    - Autonomous action mode");

//     const choice = (await question("\nChoose a mode (enter number or name): "))
//       .toLowerCase()
//       .trim();

//     if (choice === "1" || choice === "chat") {
//       rl.close();
//       return "chat";
//     } else if (choice === "2" || choice === "auto") {
//       rl.close();
//       return "auto";
//     }
//     console.log("Invalid choice. Please try again.");
//   }
// }

/**
 * Start the chatbot agent
 */
async function main() {
  try {
    const { agent, config } = await initializeAgent();
    // const mode = await chooseMode();

    await runChatMode(agent, config);
    // if (mode === "chat") {
    // } else {
    //   await runAutonomousMode(agent, config);
    // }
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


// async function testOpenRouterDirectly() {
//   console.log("Testing OpenRouter API directly...");
//   try {
//     const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
//         'HTTP-Referer': 'https://agentkit.dev',
//         'X-Title': 'AgentKit Demo'
//       },
//       body: JSON.stringify({
//         model: 'meta-llama/llama-2-70b-chat',
//         // model: 'meta-llama/llama-3.1-8b-instruct',
//         messages: [{ role: 'user', content: 'Hello' }],
//         max_tokens: 500
//       })
//     });
    
//     if (!response.ok) {
//       const errorText = await response.text();
//       console.error('API Response not OK:', response.status, errorText);
//       return null;
//     }
    
//     const json = await response.json();
//     console.log("OpenRouter direct test result:", json);
//     return json;
//   } catch (err) {
//     console.error('Error testing OpenRouter directly:', err);
//     return null;
//   }
// }

// async function listAvailableModels() {
//   try {
//     const response = await fetch('https://openrouter.ai/api/v1/models', {
//       headers: {
//         'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
//       }
//     });
//     const json = await response.json();
//     console.log("Available models:", json.data);
//     return json;
//   } catch (err) {
//     console.error('Error listing models:', err);
//     return null;
//   }
// }

// // Call this before anything else
// listAvailableModels();
// testOpenRouterDirectly();

// // import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
// const { Agentkit, AgentkitToolkit } = require("@0xgasless/agentkit");
// // import { HumanMessage } from "@langchain/core/messages";
// const { HumanMessage } = require("@langchain/core/messages");
// // import { MemorySaver } from "@langchain/langgraph";
// const { MemorySaver } = require("@langchain/langgraph");
// // import { createReactAgent } from "@langchain/langgraph/prebuilt";
// const { createReactAgent } = require("@langchain/langgraph/prebuilt");
// // import { ChatOpenAI } from "@langchain/openai";
// const { ChatOpenAI } = require("@langchain/openai");
// // import * as dotenv from "dotenv";
// const dotenv = require("dotenv");
// // import * as readline from "node:readline";
// const readline = require("node:readline");

// dotenv.config();

// function validateEnvironment(): void {
//   const missingVars: string[] = [];

//   const requiredVars = ["OPENROUTER_API_KEY", "PRIVATE_KEY", "RPC_URL", "API_KEY", "CHAIN_ID"];

//   for (const varName of requiredVars) {
//     if (!process.env[varName]) {
//       missingVars.push(varName);
//     }
//   }

//   if (missingVars.length > 0) {
//     console.error("Error: Required environment variables are not set");
//     for (const varName of missingVars) {
//       console.error(`${varName}=your_${varName.toLowerCase()}_here`);
//     }
//     process.exit(1);
//   }

//   if (!process.env.CHAIN_ID) {
//     console.warn("Warning: CHAIN_ID not set, defaulting to base-sepolia");
//   }
// }

// validateEnvironment();

// async function initializeAgent() {
//   try {
//     const llm = new ChatOpenAI({
//       model: "google/gemini-pro",
//       openAIApiKey: process.env.OPENROUTER_API_KEY,
//       configuration: {
//         baseURL: "https://openrouter.ai/api/v1",
//       },
//     });

//     // Initialize 0xGasless AgentKit
//     const agentkit = await Agentkit.configureWithWallet({
//       privateKey: process.env.PRIVATE_KEY as `0x${string}`,
//       rpcUrl: process.env.RPC_URL as string,
//       apiKey: process.env.API_KEY as string,
//       chainID: Number(process.env.CHAIN_ID) || 8453, // Base Sepolia
//     });

//     // Initialize AgentKit Toolkit and get tools
//     const agentkitToolkit = new AgentkitToolkit(agentkit);
//     const tools = agentkitToolkit.getTools();

//     const memory = new MemorySaver();
//     const agentConfig = { configurable: { thread_id: "0xGasless AgentKit Chatbot Example!" } };

//     const agent = createReactAgent({
//       llm,
//       tools,
//       checkpointSaver: memory,
//       messageModifier: `
//         You are a helpful agent that can interact with EVM chains using 0xGasless smart accounts. You can perform 
//         gasless transactions using the account abstraction wallet. You can check balances of ETH and any ERC20 token 
//         by providing their contract address. If someone asks you to do something you can't do with your currently 
//         available tools, you must say so. Be concise and helpful with your responses.
//       `,
//     });

//     return { agent, config: agentConfig };
//   } catch (error) {
//     console.error("Failed to initialize agent:", error);
//     throw error;
//   }
// }

// // For runAutonomousMode, runChatMode, chooseMode and main functions, reference:

// /**
//  * Run the agent autonomously with specified intervals
//  *
//  * @param agent - The agent executor
//  * @param config - Agent configuration
//  * @param interval - Time interval between actions in seconds
//  */

// //biome-ignore lint/suspicious/noExplicitAny: <explanation>
// // async function runAutonomousMode(agent: any, config: any, interval = 10) {
// //   console.log("Starting autonomous mode...");

// //   // eslint-disable-next-line no-constant-condition
// //   while (true) {
// //     try {
// //       const thought =
// //         "Be creative and do something interesting on the blockchain. " +
// //         "Choose an action or set of actions and execute it that highlights your abilities.";

// //       const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);

// //       for await (const chunk of stream) {
// //         if ("agent" in chunk) {
// //           console.log(chunk.agent.messages[0].content);
// //         } else if ("tools" in chunk) {
// //           console.log(chunk.tools.messages[0].content);
// //         }
// //         console.log("-------------------");
// //       }

// //       await new Promise(resolve => setTimeout(resolve, interval * 1000));
// //     } catch (error) {
// //       if (error instanceof Error) {
// //         console.error("Error:", error.message);
// //       }
// //       process.exit(1);
// //     }
// //   }
// // }

// /**
//  * Run the agent interactively based on user input
//  *
//  * @param agent - The agent executor
//  * @param config - Agent configuration
//  */
// //biome-ignore lint/suspicious/noExplicitAny: <explanation>
// async function runChatMode(agent: any, config: any) {
//   console.log("Starting chat mode... Type 'exit' to end.");

//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
//   });

//   const question = (prompt: string): Promise<string> =>
//     new Promise(resolve => rl.question(prompt, resolve));

//   try {
//     while (true) {
//       const userInput = await question("\nPrompt: ");

//       if (userInput.toLowerCase() === "exit") {
//         break;
//       }

//       const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, config);

//       for await (const chunk of stream) {
//         if ("agent" in chunk) {
//           console.log(chunk.agent.messages[0].content);
//         } else if ("tools" in chunk) {
//           console.log(chunk.tools.messages[0].content);
//         }
//         console.log("-------------------");
//       }
//     }
//   } catch (error) {
//     if (error instanceof Error) {
//       console.error("Error:", error.message);
//     }
//     process.exit(1);
//   } finally {
//     rl.close();
//   }
// }

// /**
//  * Choose whether to run in autonomous or chat mode based on user input
//  *
//  * @returns Selected mode
//  */
// // async function chooseMode(): Promise<"chat" | "auto"> {
// //   const rl = readline.createInterface({
// //     input: process.stdin,
// //     output: process.stdout,
// //   });

// //   const question = (prompt: string): Promise<string> =>
// //     new Promise(resolve => rl.question(prompt, resolve));

// //   // eslint-disable-next-line no-constant-condition
// //   while (true) {
// //     console.log("\nAvailable modes:");
// //     console.log("1. chat    - Interactive chat mode");
// //     console.log("2. auto    - Autonomous action mode");

// //     const choice = (await question("\nChoose a mode (enter number or name): "))
// //       .toLowerCase()
// //       .trim();

// //     if (choice === "1" || choice === "chat") {
// //       rl.close();
// //       return "chat";
// //     } else if (choice === "2" || choice === "auto") {
// //       rl.close();
// //       return "auto";
// //     }
// //     console.log("Invalid choice. Please try again.");
// //   }
// // }

// /**
//  * Start the chatbot agent
//  */
// async function main() {
//   try {
//     const { agent, config } = await initializeAgent();
//     // const mode = await chooseMode();

//     await runChatMode(agent, config);
//     // if (mode === "chat") {
//     // } else {
//     //   await runAutonomousMode(agent, config);
//     // }
//   } catch (error) {
//     if (error instanceof Error) {
//       console.error("Error:", error.message);
//     }
//     process.exit(1);
//   }
// }

// if (require.main === module) {
//   console.log("Starting Agent...");
//   main().catch(error => {
//     console.error("Fatal error:", error);
//     process.exit(1);
//   });
// }

