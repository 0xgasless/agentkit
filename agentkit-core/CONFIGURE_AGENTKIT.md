# AgentKit Core - API Key Configuration

This document explains the new `configureAgentkit(apiKey)` method integrated into the `@0xgasless/agentkit` package.

## Overview

The `configureAgentkit(apiKey)` method provides a lightweight way to initialize the AgentKit SDK using just an API key. All functionality is built into the core package:

- ✅ **API Key Validation**: Internal auth service validates keys
- ✅ **Default Chain**: Uses Avalanche C-Chain (43114)
- ✅ **Server-provided Wallet**: Gets wallet info from internal service
- ✅ **Graceful Failure**: Methods return error messages instead of throwing
- ✅ **No Caching**: Revalidates on every call as requested
- ✅ **Error Handling**: Clear error messages for invalid/expired keys

## Architecture

### Internal Components

```
agentkit-core/src/
├── agentkit.ts              # Main SDK with configureAgentkit method
├── services/
│   ├── authService.ts       # API key validation service
│   ├── keyManagementService.ts
│   └── index.ts
├── demo.ts                  # Demo and testing functions
└── index.ts                 # Main exports
```

### Auth Service (`services/authService.ts`)

The auth service provides:

- `verifyApiKey(apiKey)` - Validates API keys and returns wallet data
- `addApiKey(apiKey, walletData)` - Add new API keys (for testing)
- `removeApiKey(apiKey)` - Remove API keys
- `hasApiKey(apiKey)` - Check if API key exists
- `getRegisteredApiKeys()` - Get all registered keys

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
import { Agentkit } from "@0xgasless/agentkit";

const agentkit = await Agentkit.configureAgentkit("your-api-key");

// Actions will automatically revalidate the API key
const result = await agentkit.run(someAction, args);
console.log(result);
```

### API Key Management

```typescript
import {
  addApiKey,
  hasApiKey,
  getRegisteredApiKeys,
} from "@0xgasless/agentkit";

// Add a custom API key
addApiKey("my-custom-key", {
  privateKey: "0x...",
  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  chainId: 43114,
});

// Check if key exists
console.log(hasApiKey("my-custom-key")); // true

// Get all registered keys
console.log(getRegisteredApiKeys());
```

## Key Features

### 1. Internal Auth Service

- No external HTTP dependencies
- Built-in API key validation
- Mock database for development/testing
- Extensible for production use

### 2. Default Configuration

- Uses Avalanche C-Chain (43114) as default
- Automatic RPC URL configuration
- Server can override chain configuration

### 3. Revalidation

- No memory caching of API keys
- Revalidates on every method call (`run`, `getAddress`, `getChainId`)
- Ensures fresh authentication state

### 4. Graceful Failure

- Methods return error messages instead of throwing exceptions
- Clear error reporting for debugging
- Maintains SDK functionality even with auth issues

## Demo and Testing

### Run the Built-in Demo

```bash
cd agentkit-core
bun install
bun run build

# Run the demo
node -e "require('./dist/demo.js').runAllTests()"
```

### Demo Functions

The demo includes comprehensive tests:

```typescript
import {
  testConfigureAgentkit,
  testInvalidApiKey,
  testEmptyApiKey,
  testApiKeyManagement,
  testRevalidation,
  runAllTests,
} from "@0xgasless/agentkit/demo";

// Run individual tests
await testConfigureAgentkit();
await testRevalidation();

// Or run all tests
await runAllTests();
```

## API Reference

### `Agentkit.configureAgentkit(apiKey: string): Promise<Agentkit>`

Configures a new Agentkit instance using an API key.

**Parameters:**

- `apiKey` (string): The API key to authenticate with

**Returns:**

- `Promise<Agentkit>`: Configured Agentkit instance

**Throws:**

- Error if API key is empty or validation fails

### Auth Service Functions

```typescript
// Verify an API key
const result = await verifyApiKey("test-key");

// Add a new API key
addApiKey("new-key", {
  privateKey: "0x...",
  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  chainId: 43114,
});

// Check if key exists
const exists = hasApiKey("test-key");

// Get all registered keys
const keys = getRegisteredApiKeys();
```

### Auth Service Response Format

```typescript
interface AuthVerificationResponse {
  success: boolean;
  data?: {
    privateKey: `0x${string}`;
    address: string;
    rpcUrl: string;
    chainId: number;
  };
  error?: string;
}
```

## Comparison with `configureWithWallet`

| Feature        | `configureWithWallet`                | `configureAgentkit`        |
| -------------- | ------------------------------------ | -------------------------- |
| Parameters     | Multiple (privateKey, chainID, etc.) | Single API key             |
| Wallet Source  | User-provided                        | Internal service           |
| Chain Config   | Required parameter                   | Default + service override |
| Validation     | Local only                           | Internal service-based     |
| Caching        | Static configuration                 | Revalidates on each call   |
| Error Handling | Throws exceptions                    | Graceful failure           |
| Dependencies   | External wallet required             | Self-contained             |

## Development and Testing

### Pre-configured API Keys

The auth service comes with pre-configured test keys:

```typescript
const testKeys = ["test-api-key-123", "demo-key-456"];
```

### Adding Custom Keys

```typescript
import { addApiKey } from "@0xgasless/agentkit";

addApiKey("my-dev-key", {
  privateKey: "0x1234...",
  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  chainId: 43114,
});
```

### Unknown Key Behavior

For development convenience, the auth service generates new wallets for unknown API keys. In production, you would modify this behavior to reject invalid keys.

## Production Considerations

### Security

- API keys are validated internally (no external HTTP calls)
- Private keys are managed within the service
- No local caching of sensitive data
- Revalidation ensures fresh authentication state

### Customization

To customize for production:

1. **Replace Mock Database**: Modify `authService.ts` to use your database
2. **Add Real Validation**: Implement actual API key validation logic
3. **Error Handling**: Customize error responses for your use case
4. **Logging**: Add appropriate logging and monitoring

### Example Production Auth Service

```typescript
// Custom auth service for production
export async function verifyApiKey(
  apiKey: string
): Promise<AuthVerificationResponse> {
  // Replace with your actual validation logic
  const isValid = await yourApiKeyValidationService(apiKey);

  if (!isValid) {
    return {
      success: false,
      error: "Invalid API key",
    };
  }

  // Get wallet data from your service
  const walletData = await yourWalletService.getWalletForApiKey(apiKey);

  return {
    success: true,
    data: walletData,
  };
}
```

## Integration Examples

### With LangChain

```typescript
import { Agentkit } from "@0xgasless/agentkit";
import { LangchainAgentkitToolkit } from "@0xgasless/agentkit";

const agentkit = await Agentkit.configureAgentkit("your-api-key");
const toolkit = new LangchainAgentkitToolkit(agentkit);
const tools = toolkit.getTools();
```

### With Custom Actions

```typescript
import { Agentkit } from "@0xgasless/agentkit";

const agentkit = await Agentkit.configureAgentkit("your-api-key");

// Custom action will automatically revalidate API key
const result = await agentkit.run(customAction, {
  amount: "1.0",
  recipient: "0x...",
});
```

This implementation provides a complete, self-contained solution for API key-based SDK initialization within the `@0xgasless/agentkit` package.
