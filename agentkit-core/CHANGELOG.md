# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- DexScreener API integration with comprehensive trading pair data access
- `GetLatestTokenProfilesAction` - Retrieve the latest token profiles from DexScreener
- `GetLatestBoostedTokensAction` - Get recently boosted tokens with boost amounts
- `GetTopBoostedTokensAction` - Fetch tokens with most active boosts ranked by total boost amounts
- `GetTokenOrdersAction` - Check paid orders for specific tokens by chain and address
- `GetPairsByChainAndAddressAction` - Get detailed pair information by chain and pair address
- `SearchPairsAction` - Search for trading pairs using token symbols, names, or addresses
- `GetPairsByTokenAddressesAction` - Retrieve pairs for multiple token addresses (up to 30 per request)
- Full TypeScript support with proper type definitions for all DexScreener API responses
- Comprehensive error handling and input validation for all DexScreener actions
- Rate limiting awareness (60-300 requests per minute depending on endpoint)
- Support for multiple blockchain networks (Avax, Solana, Ethereum, BSC, etc.)
- Rich formatted output with emojis and structured data display 