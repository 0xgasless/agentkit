import { networkConfig, supportedChains, tokenMappings, getChainName, isTestnet } from '../constants';

export const validateChainSupport = (chainId: number): void => {
  if (!supportedChains[chainId]) {
    const availableChains = Object.keys(supportedChains).join(', ');
    throw new Error(`Chain ID ${chainId} is not supported. Available chains: ${availableChains}`);
  }

  const config = networkConfig[chainId];
  if (config?.isTestnet && !config.paymaster) {
    throw new Error(`Testnet chain ${chainId} is not fully configured. Missing paymaster address. Please contact maintainers.`);
  }
};

export const validateTokenSupport = (chainId: number, tokenSymbol: string): void => {
  validateChainSupport(chainId);
  
  const tokenAddress = tokenMappings[chainId]?.[tokenSymbol];
  if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
    const availableTokens = Object.keys(tokenMappings[chainId] || {}).join(', ');
    throw new Error(
      `Token ${tokenSymbol} is not supported on chain ${chainId} (${getChainName(chainId)}). ` +
      `Available tokens: ${availableTokens || 'None configured'}`
    );
  }
};

export const warnIfTestnet = (chainId: number): void => {
  if (isTestnet(chainId)) {
    console.warn(`⚠️  You are using testnet chain ${getChainName(chainId)}. Transactions use test tokens with no real value.`);
  }
};

export const validateAddress = (address: string): boolean => {
  // Basic Ethereum address validation
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  return addressRegex.test(address);
};

export const getTokenAddress = (chainId: number, tokenSymbol: string): `0x${string}` => {
  validateTokenSupport(chainId, tokenSymbol);
  return tokenMappings[chainId][tokenSymbol];
};

export const getSupportedTokens = (chainId: number): string[] => {
  validateChainSupport(chainId);
  return Object.keys(tokenMappings[chainId] || {});
};

export const getChainInfo = (chainId: number) => {
  validateChainSupport(chainId);
  const config = networkConfig[chainId];
  const chain = supportedChains[chainId];
  
  return {
    chainId,
    name: getChainName(chainId),
    isTestnet: isTestnet(chainId),
    rpcUrl: config?.rpcUrl,
    hasPaymaster: !!config?.paymaster,
    supportedTokens: getSupportedTokens(chainId),
    nativeCurrency: chain?.nativeCurrency,
  };
};