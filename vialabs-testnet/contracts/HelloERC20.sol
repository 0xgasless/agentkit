// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/**
 * @title HelloERC20
 * @dev Cross-chain ERC20 token using ViaLabs MessageClient
 * 
 * This token implements proper cross-chain bridging via ViaLabs infrastructure:
 * - Burn tokens on source chain
 * - Call _sendMessage() to send cross-chain message via ViaLabs validators
 * - Receive _processMessage() on destination chain
 * - Mint tokens to recipient on destination chain
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@vialabs-io/contracts/MessageClient.sol";

contract HelloERC20 is ERC20, ERC20Burnable, MessageClient {
    // Events
    event BridgeInitiated(uint256 indexed txId, uint256 indexed destChainId, address indexed recipient, uint256 amount);
    event BridgeReceived(uint256 indexed txId, uint256 indexed sourceChainId, address indexed recipient, uint256 amount);
    
    constructor() ERC20("HelloERC20", "HELLO") {
        // Set MESSAGE_OWNER to deployer (required for configureClient to work)
        MESSAGE_OWNER = msg.sender;
        
        // Mint initial supply to deployer for testing
        _mint(msg.sender, 1_000_000 * 10**decimals());
    }
    
    /**
     * @dev Check if a chain is active for bridging
     */
    function isChainActive(uint256 _chainId) external view returns (bool) {
        return CHAINS[_chainId].endpoint != address(0);
    }
    
    /**
     * @dev Bridge tokens to another chain
     * Burns tokens on this chain and sends cross-chain message via ViaLabs
     */
    function bridge(uint256 _destChainId, address _recipient, uint256 _amount) external returns (uint256 txId) {
        require(CHAINS[_destChainId].endpoint != address(0), "Destination chain not configured");
        require(_amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        // Burn tokens on source chain
        _burn(msg.sender, _amount);
        
        // Encode the message data (recipient and amount)
        bytes memory _data = abi.encode(_recipient, _amount);
        
        // Send cross-chain message via ViaLabs - this calls the ViaLabs validator network
        txId = _sendMessage(_destChainId, _data);
        
        emit BridgeInitiated(txId, _destChainId, _recipient, _amount);
    }
    
    /**
     * @dev Process incoming bridge message from ViaLabs
     * This is called by the ViaLabs message relay when a cross-chain message arrives
     */
    function _processMessage(
        uint256 _txId,
        uint256 _sourceChainId,
        bytes calldata _data
    ) internal virtual override {
        // Decode the message data
        (address _recipient, uint256 _amount) = abi.decode(_data, (address, uint256));
        
        // Mint tokens to recipient on destination chain
        _mint(_recipient, _amount);
        
        emit BridgeReceived(_txId, _sourceChainId, _recipient, _amount);
    }
    
    /**
     * @dev Mint additional tokens (for testing only)
     */
    function mint(address _to, uint256 _amount) external onlyMessageOwner {
        _mint(_to, _amount);
    }
}
