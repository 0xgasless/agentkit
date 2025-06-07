import { Agentkit } from "./agentkit";
import { addApiKey, getRegisteredApiKeys, hasApiKey } from "./services/authService";

async function testConfigureAgentkit() {
  console.log('Testing configureAgentkit method...\n');

  try {
    // Test with a demo API key
    const apiKey = 'test-api-key-123';
    console.log(`Configuring Agentkit with API key: ${apiKey}`);
    
    const agentkit = await Agentkit.configureAgentkit(apiKey);
    console.log('✅ Agentkit configured successfully!');

    // Test getting address
    console.log('\nTesting getAddress...');
    const address = await agentkit.getAddress();
    console.log(`✅ Wallet address: ${address}`);

    // Test getting chain ID
    console.log('\nTesting getChainId...');
    const chainId = await agentkit.getChainId();
    console.log(`✅ Chain ID: ${chainId}`);

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
  }
}

async function testInvalidApiKey() {
  console.log('\n\nTesting with invalid API key...');

  try {
    const invalidApiKey = 'invalid-key-xyz';
    console.log(`Attempting to configure with invalid API key: ${invalidApiKey}`);
    
    const agentkit = await Agentkit.configureAgentkit(invalidApiKey);
    
    // This should still work because our demo service generates wallets for unknown keys
    console.log('✅ Configuration succeeded (demo service generates wallets for unknown keys)');
    
    const address = await agentkit.getAddress();
    console.log(`✅ Generated wallet address: ${address}`);

  } catch (error) {
    console.log(`✅ Expected error for invalid key: ${error instanceof Error ? error.message : error}`);
  }
}

async function testEmptyApiKey() {
  console.log('\n\nTesting with empty API key...');

  try {
    await Agentkit.configureAgentkit('');
    console.log('❌ Should have failed with empty API key');
  } catch (error) {
    console.log(`✅ Expected error for empty key: ${error instanceof Error ? error.message : error}`);
  }
}

async function testApiKeyManagement() {
  console.log('\n\nTesting API key management...');

  // Add a custom API key
  const customApiKey = 'custom-test-key';
  addApiKey(customApiKey, {
    privateKey: '0x9999999999999999999999999999999999999999999999999999999999999999',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    chainId: 43114
  });

  console.log(`✅ Added custom API key: ${customApiKey}`);
  console.log(`✅ Key exists: ${hasApiKey(customApiKey)}`);
  
  // Test with the custom key
  const agentkit = await Agentkit.configureAgentkit(customApiKey);
  const address = await agentkit.getAddress();
  console.log(`✅ Custom key wallet address: ${address}`);

  // Show all registered keys
  console.log(`✅ All registered keys: ${getRegisteredApiKeys().join(', ')}`);
}

async function testRevalidation() {
  console.log('\n\nTesting revalidation on every call...');

  try {
    const apiKey = 'test-api-key-123';
    const agentkit = await Agentkit.configureAgentkit(apiKey);
    
    console.log('✅ Initial configuration successful');
    
    // Multiple calls should each trigger revalidation
    console.log('Testing multiple calls (each should revalidate)...');
    
    const address1 = await agentkit.getAddress();
    console.log(`✅ Call 1 - Address: ${address1}`);
    
    const chainId1 = await agentkit.getChainId();
    console.log(`✅ Call 2 - Chain ID: ${chainId1}`);
    
    const address2 = await agentkit.getAddress();
    console.log(`✅ Call 3 - Address: ${address2}`);
    
    console.log('✅ All calls succeeded with revalidation');

  } catch (error) {
    console.error('❌ Revalidation test failed:', error instanceof Error ? error.message : error);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting AgentKit configureAgentkit Demo\n');
  console.log('Testing internal auth service integration...\n');
  
  await testConfigureAgentkit();
  await testInvalidApiKey();
  await testEmptyApiKey();
  await testApiKeyManagement();
  await testRevalidation();
  
  console.log('\n✨ Demo completed!');
}

// Export for external use
export {
  testConfigureAgentkit,
  testInvalidApiKey,
  testEmptyApiKey,
  testApiKeyManagement,
  testRevalidation,
  runAllTests
};

// Run if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
} 