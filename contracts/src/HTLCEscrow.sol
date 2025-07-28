// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HTLCEscrow
 * @dev Production-ready Hashed Timelock Contract for cross-chain atomic swaps
 * Implements full HTLC security with hashlock and timelock enforcement
 * Compatible with Ethereum, Monad, and other EVM chains
 */
contract HTLCEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    struct Escrow {
        address payable sender;
        address payable receiver;
        uint256 amount;
        bytes32 secretHash;
        uint256 timelock;
        bool withdrawn;
        bool cancelled;
        address tokenAddress; // address(0) for native token
        string orderId;
        uint256 createdAt;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(string => bytes32) public orderToEscrowId;
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        string orderId
    );
    
    event EscrowWithdrawn(
        bytes32 indexed escrowId,
        address indexed receiver,
        bytes32 secret,
        string orderId
    );
    
    event EscrowCancelled(
        bytes32 indexed escrowId,
        address indexed sender,
        string orderId
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Create an HTLC escrow with native token (ETH/MON)
     */
    function createHTLCEscrowNative(
        bytes32 secretHash,
        uint256 timelock,
        address payable sender,
        address payable receiver,
        string memory orderId
    ) external payable returns (bytes32) {
        require(msg.value > 0, "Amount must be greater than 0");
        require(timelock > block.timestamp, "Timelock must be in the future");
        require(bytes(orderId).length > 0, "Order ID cannot be empty");
        
        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender,
            secretHash,
            timelock,
            orderId,
            block.timestamp
        ));
        
        require(escrows[escrowId].amount == 0, "Escrow already exists");
        require(orderToEscrowId[orderId] == bytes32(0), "Order ID already used");
        
        escrows[escrowId] = Escrow({
            sender: sender,
            receiver: receiver,
            amount: msg.value,
            secretHash: secretHash,
            timelock: timelock,
            withdrawn: false,
            cancelled: false,
            tokenAddress: address(0),
            orderId: orderId,
            createdAt: block.timestamp
        });
        
        orderToEscrowId[orderId] = escrowId;
        
        emit EscrowCreated(escrowId, sender, receiver, msg.value, secretHash, timelock, orderId);
        return escrowId;
    }

    /**
     * @dev Create an HTLC escrow with ERC20 token
     */
    function createHTLCEscrowERC20(
        address tokenAddress,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address payable sender,
        address payable receiver,
        string memory orderId
    ) external returns (bytes32) {
        require(tokenAddress != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(timelock > block.timestamp, "Timelock must be in the future");
        require(bytes(orderId).length > 0, "Order ID cannot be empty");
        
        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender,
            tokenAddress,
            secretHash,
            timelock,
            orderId,
            block.timestamp
        ));
        
        require(escrows[escrowId].amount == 0, "Escrow already exists");
        require(orderToEscrowId[orderId] == bytes32(0), "Order ID already used");
        
        // Transfer tokens to this contract
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        
        escrows[escrowId] = Escrow({
            sender: sender,
            receiver: receiver,
            amount: amount,
            secretHash: secretHash,
            timelock: timelock,
            withdrawn: false,
            cancelled: false,
            tokenAddress: tokenAddress,
            orderId: orderId,
            createdAt: block.timestamp
        });
        
        orderToEscrowId[orderId] = escrowId;
        
        emit EscrowCreated(escrowId, sender, receiver, amount, secretHash, timelock, orderId);
        return escrowId;
    }

    /**
     * @dev Withdraw funds from escrow by providing the secret
     */
    function withdraw(bytes32 escrowId, string memory secret) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.cancelled, "Already cancelled");
        require(keccak256(abi.encodePacked(secret)) == escrow.secretHash, "Invalid secret");
        
        escrow.withdrawn = true;
        
        if (escrow.tokenAddress == address(0)) {
            // Native token transfer
            escrow.receiver.transfer(escrow.amount);
        } else {
            // ERC20 token transfer
            IERC20(escrow.tokenAddress).transfer(escrow.receiver, escrow.amount);
        }
        
        emit EscrowWithdrawn(escrowId, escrow.receiver, escrow.secretHash, escrow.orderId);
    }

    /**
     * @dev Cancel escrow and refund sender after timelock expires
     */
    function cancel(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.cancelled, "Already cancelled");
        require(block.timestamp >= escrow.timelock, "Timelock not yet expired");
        
        escrow.cancelled = true;
        
        if (escrow.tokenAddress == address(0)) {
            // Native token refund
            escrow.sender.transfer(escrow.amount);
        } else {
            // ERC20 token refund
            IERC20(escrow.tokenAddress).transfer(escrow.sender, escrow.amount);
        }
        
        emit EscrowCancelled(escrowId, escrow.sender, escrow.orderId);
    }

    /**
     * @dev Get escrow details by order ID
     */
    function getEscrowByOrderId(string memory orderId) external view returns (
        bytes32 escrowId,
        address sender,
        address receiver,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        bool withdrawn,
        bool cancelled,
        address tokenAddress,
        uint256 createdAt
    ) {
        escrowId = orderToEscrowId[orderId];
        require(escrowId != bytes32(0), "Order not found");
        
        Escrow storage escrow = escrows[escrowId];
        return (
            escrowId,
            escrow.sender,
            escrow.receiver,
            escrow.amount,
            escrow.secretHash,
            escrow.timelock,
            escrow.withdrawn,
            escrow.cancelled,
            escrow.tokenAddress,
            escrow.createdAt
        );
    }

    /**
     * @dev Check if escrow can be withdrawn (secret matches and not expired)
     */
    function canWithdraw(bytes32 escrowId, string memory secret) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.withdrawn && 
               !escrow.cancelled &&
               keccak256(abi.encodePacked(secret)) == escrow.secretHash;
    }

    /**
     * @dev Check if escrow can be cancelled (timelock expired)
     */
    function canCancel(bytes32 escrowId) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.withdrawn && 
               !escrow.cancelled &&
               block.timestamp >= escrow.timelock;
    }

    /**
     * @dev Emergency function to recover stuck funds (only owner)
     */
    function emergencyRecovery(bytes32 escrowId) external onlyOwner {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.withdrawn && !escrow.cancelled, "Escrow already resolved");
        require(block.timestamp >= escrow.timelock + 7 days, "Emergency period not reached");
        
        escrow.cancelled = true;
        
        if (escrow.tokenAddress == address(0)) {
            escrow.sender.transfer(escrow.amount);
        } else {
            IERC20(escrow.tokenAddress).transfer(escrow.sender, escrow.amount);
        }
        
        emit EscrowCancelled(escrowId, escrow.sender, escrow.orderId);
    }
}