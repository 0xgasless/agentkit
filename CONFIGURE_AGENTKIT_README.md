# AgentKit SDK - API Key Configuration

This document explains how to use the new `configureAgentkit(apiKey)` method for simplified SDK initialization.

## Overview

The `configureAgentkit(apiKey)` method provides a lightweight way to initialize the AgentKit SDK using just an API key. The method handles:

- API key validation with the backend
- Automatic wallet configuration from server response
- Default chain configuration (Avalanche C-Chain - 43114)
- Graceful error handling for invalid/expired keys
- Revalidation on every method call (no caching)

## Setup

### 1. Start the Authentication Server

First, install the server dependencies and start the auth server:

```bash
# Install server dependencies
npm install express cors viem

# Start the auth server
node server.js
```

The server will run on `http://localhost:3001` and provide:

- `POST /auth/verify-key` - API key verification endpoint
- `GET /health` - Health check endpoint

### 2. Build the AgentKit SDK

```bash
cd agentkit-core
bun install
bun run build
```

## Usage

### Basic Configuration

```typescript
import { Agentkit } from "@0xgasless/agentkit";

// Configure with just an API key
const agentkit = await Agentkit.configureAgentkit("your-api-key-here");

// Use the configured instance
const address = await agentkit.getAddress();
const chainId = await agentkit.getChainId();
```

### Error Handling

The method provides graceful error handling:

```typescript
try {
  const agentkit = await Agentkit.configureAgentkit("invalid-key");

  // Methods will revalidate the API key on each call
  const address = await agentkit.getAddress();
} catch (error) {
  console.error("Configuration failed:", error.message);
}
```

### Running Actions

```typescript
import { GetBalanceAction } from "@0xgasless/agentkit";

const agentkit = await Agentkit.configureAgentkit("your-api-key");

// Actions will automatically revalidate the API key
const result = await agentkit.run(new GetBalanceAction(), {});
console.log(result);
```

## Key Features

### 1. API Key Validation

- Validates keys with `/auth/verify-key` endpoint
- Returns wallet information (private key, address, RPC URL, chain ID)
- Handles invalid/expired keys gracefully

### 2. Default Configuration

- Uses Avalanche C-Chain (43114) as default
- Server can override chain configuration
- Automatic RPC URL configuration

### 3. Revalidation

- No memory caching of API keys
- Revalidates on every method call (`run`, `getAddress`, `getChainId`)
- Ensures fresh authentication state

### 4. Graceful Failure

- Methods return error messages instead of throwing exceptions
- Clear error reporting for debugging
- Maintains SDK functionality even with auth issues

## API Reference

### `Agentkit.configureAgentkit(apiKey: string): Promise<Agentkit>`

Configures a new Agentkit instance using an API key.

**Parameters:**

- `apiKey` (string): The API key to authenticate with

**Returns:**

- `Promise<Agentkit>`: Configured Agentkit instance

**Throws:**

- Error if API key is empty or validation fails

### Authentication Server Response

The `/auth/verify-key` endpoint should return:

```json
{
  "success": true,
  "data": {
    "privateKey": "0x...",
    "address": "0x...",
    "rpcUrl": "https://api.avax.network/ext/bc/C/rpc",
    "chainId": 43114
  }
}
```

## Demo

Run the demo script to test the functionality:

```bash
# Make sure the auth server is running
node server.js

# In another terminal, run the demo
node demo-configureAgentkit.js
```

The demo tests:

- Valid API key configuration
- Invalid API key handling
- Empty API key validation
- Address and chain ID retrieval

## Comparison with `configureWithWallet`

| Feature        | `configureWithWallet`                | `configureAgentkit`       |
| -------------- | ------------------------------------ | ------------------------- |
| Parameters     | Multiple (privateKey, chainID, etc.) | Single API key            |
| Wallet Source  | User-provided                        | Server-provided           |
| Chain Config   | Required parameter                   | Default + server override |
| Validation     | Local only                           | Server-based              |
| Caching        | Static configuration                 | Revalidates on each call  |
| Error Handling | Throws exceptions                    | Graceful failure          |

## Security Considerations

- API keys are sent to the server for validation
- Private keys are returned from the server (ensure HTTPS in production)
- No local caching of sensitive data
- Revalidation ensures fresh authentication state

## Production Deployment

For production use:

1. Use HTTPS for the authentication server
2. Implement proper API key management
3. Add rate limiting to the auth endpoint
4. Consider caching strategies for performance
5. Implement proper error logging and monitoring
