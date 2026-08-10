# ViaLabs HelloERC20 Testnet Setup

This folder contains the HelloERC20 example contract for testing ViaLabs cross-chain messaging on testnets.

## Prerequisites

1. Node.js v18+
2. Testnet native tokens:
   - Avalanche Fuji: Get AVAX from [Avalanche Faucet](https://core.app/en/tools/testnet-faucet/?subnet=c&token=c)
   - Base Sepolia: Get ETH from [Base Faucet](https://www.alchemy.com/faucets/base-sepolia)

## Quick Start

```bash
# Install dependencies
npm install

# Set up your private key
cp .env.example .env
# Edit .env with your private key

# Deploy to Avalanche Fuji
npx hardhat run scripts/deploy.ts --network fuji

# Deploy to Base Sepolia  
npx hardhat run scripts/deploy.ts --network baseSepolia

# Configure cross-chain (run after deploying to both chains)
npx hardhat run scripts/configure.ts --network fuji
npx hardhat run scripts/configure.ts --network baseSepolia
```

## Contract Overview

The `HelloERC20` contract is a simple cross-chain token that:
1. Mints 1,000,000 tokens to the deployer on first deployment
2. Implements `bridge(destChainId, recipient, amount)` to burn tokens and send cross-chain message
3. Implements `_processMessage()` to receive messages and mint tokens on destination

## Testing with AgentKit

After deployment and configuration, update the token addresses in your AgentKit demo:

```typescript
// In agentkit-demo, ask the agent:
"Bridge 100 HELLO tokens to Base Sepolia (chain 84532) to address 0x..."
```

## ViaLabs Fee Notes

- **Testnets**: Most fees are sponsored by ViaLabs
- **Source fee**: Paid in USDC/USDT (FEE_TOKEN)
- **Destination gas**: Paid in wrapped native tokens (WAVAX, WETH)

For testnets, ensure your contract has small amounts of testnet USDC and wrapped native tokens.
