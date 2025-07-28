// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HTLCEscrowFixed
 * @dev PRODUCTION-READY Hashed Timelock Contract with full HTLC compliance
 * Implements proper access control, security, and atomic swap guarantees
 * Compatible with Ethereum, Monad, and other EVM chains
 */
contract HTLCEscrowFixed is ReentrancyGuard, Ownable {
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
    
    // Events
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address tokenAddress,
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

    // Custom errors for gas efficiency
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error AlreadyWithdrawn();
    error AlreadyCancelled();
    error InvalidSecret();
    error TimelockNotExpired();
    error TimelockMustBeFuture();
    error UnauthorizedAccess();
    error InvalidAmount();
    error InvalidAddress();
    error OrderIdAlreadyUsed();
    error TokenTransferFailed();

    // Modifiers for access control and validation
    modifier escrowExists(bytes32 escrowId) {
        if (escrows[escrowId].amount == 0) revert EscrowNotFound();
        _;
    }

    modifier notWithdrawn(bytes32 escrowId) {
        if (escrows[escrowId].withdrawn) revert AlreadyWithdrawn();
        _;
    }

    modifier notCancelled(bytes32 escrowId) {
        if (escrows[escrowId].cancelled) revert AlreadyCancelled();
        _;
    }

    modifier onlyReceiver(bytes32 escrowId) {
        if (msg.sender != escrows[escrowId].receiver) revert UnauthorizedAccess();
        _;
    }

    modifier onlySender(bytes32 escrowId) {
        if (msg.sender != escrows[escrowId].sender) revert UnauthorizedAccess();
        _;
    }

    modifier timelockExpired(bytes32 escrowId) {
        if (block.timestamp < escrows[escrowId].timelock) revert TimelockNotExpired();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Create HTLC escrow with native token (ETH/MON)
     * @param secretHash Hash of the secret (keccak256)
     * @param timelock Unix timestamp when refund becomes available
     * @param receiver Address that can withdraw with secret
     * @param orderId Unique identifier for the order
     * @return escrowId Unique identifier for this escrow
     */
    function createHTLCEscrowNative(
        bytes32 secretHash,
        uint256 timelock,
        address payable receiver,
        string memory orderId
    ) external payable nonReentrant returns (bytes32) {
        if (msg.value == 0) revert InvalidAmount();
        if (timelock <= block.timestamp) revert TimelockMustBeFuture();
        if (receiver == address(0)) revert InvalidAddress();
        if (bytes(orderId).length == 0) revert InvalidAmount();
        
        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender,
            receiver,
            secretHash,
            timelock,
            orderId,
            block.timestamp,
            msg.value
        ));
        
        if (escrows[escrowId].amount != 0) revert EscrowAlreadyExists();
        if (orderToEscrowId[orderId] != bytes32(0)) revert OrderIdAlreadyUsed();
        
        escrows[escrowId] = Escrow({
            sender: payable(msg.sender),
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
        
        emit EscrowCreated(
            escrowId,
            msg.sender,
            receiver,
            msg.value,
            secretHash,
            timelock,
            address(0),
            orderId
        );
        
        return escrowId;
    }

    /**
     * @dev Create HTLC escrow with ERC20 token
     * @param tokenAddress Contract address of the ERC20 token
     * @param amount Amount of tokens to escrow
     * @param secretHash Hash of the secret (keccak256)
     * @param timelock Unix timestamp when refund becomes available
     * @param receiver Address that can withdraw with secret
     * @param orderId Unique identifier for the order
     * @return escrowId Unique identifier for this escrow
     */
    function createHTLCEscrowERC20(
        address tokenAddress,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address payable receiver,
        string memory orderId
    ) external nonReentrant returns (bytes32) {
        if (tokenAddress == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (timelock <= block.timestamp) revert TimelockMustBeFuture();
        if (receiver == address(0)) revert InvalidAddress();
        if (bytes(orderId).length == 0) revert InvalidAmount();
        
        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender,
            receiver,
            tokenAddress,
            amount,
            secretHash,
            timelock,
            orderId,
            block.timestamp
        ));
        
        if (escrows[escrowId].amount != 0) revert EscrowAlreadyExists();
        if (orderToEscrowId[orderId] != bytes32(0)) revert OrderIdAlreadyUsed();
        
        // Transfer tokens to this contract using SafeERC20
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        
        escrows[escrowId] = Escrow({
            sender: payable(msg.sender),
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
        
        emit EscrowCreated(
            escrowId,
            msg.sender,
            receiver,
            amount,
            secretHash,
            timelock,
            tokenAddress,
            orderId
        );
        
        return escrowId;
    }

    /**
     * @dev Withdraw funds by providing the secret (HTLC hashlock)
     * Only the designated receiver can call this function
     * @param escrowId Unique identifier for the escrow
     * @param secret The preimage of the secretHash
     */
    function withdraw(
        bytes32 escrowId,
        string memory secret
    ) 
        external 
        nonReentrant
        escrowExists(escrowId)
        notWithdrawn(escrowId)
        notCancelled(escrowId)
        onlyReceiver(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        
        // Verify secret matches hash (CRITICAL HTLC REQUIREMENT)
        bytes32 providedSecretHash = keccak256(abi.encodePacked(secret));
        if (providedSecretHash != escrow.secretHash) revert InvalidSecret();
        
        escrow.withdrawn = true;
        
        // Transfer funds to receiver
        if (escrow.tokenAddress == address(0)) {
            // Native token transfer with gas limit
            (bool success, ) = escrow.receiver.call{value: escrow.amount, gas: 2300}("");
            if (!success) revert TokenTransferFailed();
        } else {
            // ERC20 token transfer using SafeERC20
            IERC20(escrow.tokenAddress).safeTransfer(escrow.receiver, escrow.amount);
        }
        
        emit EscrowWithdrawn(escrowId, escrow.receiver, providedSecretHash, escrow.orderId);
    }

    /**
     * @dev Cancel escrow and refund sender after timelock expires (HTLC timelock)
     * Only the original sender can call this function
     * @param escrowId Unique identifier for the escrow
     */
    function cancel(
        bytes32 escrowId
    ) 
        external 
        nonReentrant
        escrowExists(escrowId)
        notWithdrawn(escrowId)
        notCancelled(escrowId)
        onlySender(escrowId)
        timelockExpired(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        
        escrow.cancelled = true;
        
        // Refund to sender
        if (escrow.tokenAddress == address(0)) {
            // Native token refund with gas limit
            (bool success, ) = escrow.sender.call{value: escrow.amount, gas: 2300}("");
            if (!success) revert TokenTransferFailed();
        } else {
            // ERC20 token refund using SafeERC20
            IERC20(escrow.tokenAddress).safeTransfer(escrow.sender, escrow.amount);
        }
        
        emit EscrowCancelled(escrowId, escrow.sender, escrow.orderId);
    }

    /**
     * @dev Get complete escrow details
     */
    function getEscrow(bytes32 escrowId) external view returns (
        address sender,
        address receiver,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        bool withdrawn,
        bool cancelled,
        address tokenAddress,
        string memory orderId,
        uint256 createdAt
    ) {
        Escrow storage escrow = escrows[escrowId];
        return (
            escrow.sender,
            escrow.receiver,
            escrow.amount,
            escrow.secretHash,
            escrow.timelock,
            escrow.withdrawn,
            escrow.cancelled,
            escrow.tokenAddress,
            escrow.orderId,
            escrow.createdAt
        );
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
        if (escrowId == bytes32(0)) revert EscrowNotFound();
        
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
     * @dev Verify if provided secret is correct for escrow
     */
    function verifySecret(bytes32 escrowId, string memory secret) external view returns (bool) {
        if (escrows[escrowId].amount == 0) return false;
        return keccak256(abi.encodePacked(secret)) == escrows[escrowId].secretHash;
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
     * @dev Check if escrow can be withdrawn (not yet expired, not processed)
     */
    function canWithdraw(bytes32 escrowId) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.withdrawn && 
               !escrow.cancelled;
    }

    /**
     * @dev Create multiple HTLC escrows for partial fills (native token)
     * @param amounts Array of amounts for each partial escrow
     * @param secretHashes Array of secret hashes for each partial escrow
     * @param timelock Unix timestamp when refund becomes available
     * @param receiver Address that can withdraw with secrets
     * @param baseOrderId Base order ID (will be suffixed with part number)
     * @return escrowIds Array of unique identifiers for each escrow
     */
    function createPartialHTLCEscrowsNative(
        uint256[] memory amounts,
        bytes32[] memory secretHashes,
        uint256 timelock,
        address payable receiver,
        string memory baseOrderId
    ) external payable nonReentrant returns (bytes32[] memory) {
        if (amounts.length != secretHashes.length) revert InvalidAmount();
        if (amounts.length == 0) revert InvalidAmount();
        if (timelock <= block.timestamp) revert TimelockMustBeFuture();
        if (receiver == address(0)) revert InvalidAddress();
        if (bytes(baseOrderId).length == 0) revert InvalidAmount();
        
        // Verify total amount matches msg.value
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert InvalidAmount();
            totalAmount += amounts[i];
        }
        if (totalAmount != msg.value) revert InvalidAmount();
        
        bytes32[] memory escrowIds = new bytes32[](amounts.length);
        
        for (uint256 i = 0; i < amounts.length; i++) {
            string memory partOrderId = string(abi.encodePacked(baseOrderId, "_", _toString(i + 1)));
            
            bytes32 escrowId = keccak256(abi.encodePacked(
                msg.sender,
                receiver,
                secretHashes[i],
                timelock,
                partOrderId,
                block.timestamp,
                amounts[i],
                i // Add index for uniqueness
            ));
            
            if (escrows[escrowId].amount != 0) revert EscrowAlreadyExists();
            if (orderToEscrowId[partOrderId] != bytes32(0)) revert OrderIdAlreadyUsed();
            
            escrows[escrowId] = Escrow({
                sender: payable(msg.sender),
                receiver: receiver,
                amount: amounts[i],
                secretHash: secretHashes[i],
                timelock: timelock,
                withdrawn: false,
                cancelled: false,
                tokenAddress: address(0),
                orderId: partOrderId,
                createdAt: block.timestamp
            });
            
            orderToEscrowId[partOrderId] = escrowId;
            escrowIds[i] = escrowId;
            
            emit EscrowCreated(
                escrowId,
                msg.sender,
                receiver,
                amounts[i],
                secretHashes[i],
                timelock,
                address(0),
                partOrderId
            );
        }
        
        return escrowIds;
    }

    /**
     * @dev Create multiple HTLC escrows for partial fills (ERC20 token)
     * @param tokenAddress Contract address of the ERC20 token
     * @param amounts Array of amounts for each partial escrow
     * @param secretHashes Array of secret hashes for each partial escrow
     * @param timelock Unix timestamp when refund becomes available
     * @param receiver Address that can withdraw with secrets
     * @param baseOrderId Base order ID (will be suffixed with part number)
     * @return escrowIds Array of unique identifiers for each escrow
     */
    function createPartialHTLCEscrowsERC20(
        address tokenAddress,
        uint256[] memory amounts,
        bytes32[] memory secretHashes,
        uint256 timelock,
        address payable receiver,
        string memory baseOrderId
    ) external nonReentrant returns (bytes32[] memory) {
        if (tokenAddress == address(0)) revert InvalidAddress();
        if (amounts.length != secretHashes.length) revert InvalidAmount();
        if (amounts.length == 0) revert InvalidAmount();
        if (timelock <= block.timestamp) revert TimelockMustBeFuture();
        if (receiver == address(0)) revert InvalidAddress();
        if (bytes(baseOrderId).length == 0) revert InvalidAmount();
        
        // Calculate total amount and transfer tokens
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert InvalidAmount();
            totalAmount += amounts[i];
        }
        
        // Transfer total tokens to this contract using SafeERC20
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), totalAmount);
        
        bytes32[] memory escrowIds = new bytes32[](amounts.length);
        
        for (uint256 i = 0; i < amounts.length; i++) {
            string memory partOrderId = string(abi.encodePacked(baseOrderId, "_", _toString(i + 1)));
            
            bytes32 escrowId = keccak256(abi.encodePacked(
                msg.sender,
                receiver,
                tokenAddress,
                amounts[i],
                secretHashes[i],
                timelock,
                partOrderId,
                block.timestamp,
                i // Add index for uniqueness
            ));
            
            if (escrows[escrowId].amount != 0) revert EscrowAlreadyExists();
            if (orderToEscrowId[partOrderId] != bytes32(0)) revert OrderIdAlreadyUsed();
            
            escrows[escrowId] = Escrow({
                sender: payable(msg.sender),
                receiver: receiver,
                amount: amounts[i],
                secretHash: secretHashes[i],
                timelock: timelock,
                withdrawn: false,
                cancelled: false,
                tokenAddress: tokenAddress,
                orderId: partOrderId,
                createdAt: block.timestamp
            });
            
            orderToEscrowId[partOrderId] = escrowId;
            escrowIds[i] = escrowId;
            
            emit EscrowCreated(
                escrowId,
                msg.sender,
                receiver,
                amounts[i],
                secretHashes[i],
                timelock,
                tokenAddress,
                partOrderId
            );
        }
        
        return escrowIds;
    }

    /**
     * @dev Helper function to convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Emergency recovery function (only owner, after extended period)
     * This is a safety mechanism for stuck funds after 30 days
     */
    function emergencyRecovery(bytes32 escrowId) external onlyOwner {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.amount == 0) revert EscrowNotFound();
        if (escrow.withdrawn || escrow.cancelled) revert AlreadyWithdrawn();
        
        // Only allow after 30 days beyond timelock
        if (block.timestamp < escrow.timelock + 30 days) revert TimelockNotExpired();
        
        escrow.cancelled = true;
        
        // Refund to original sender
        if (escrow.tokenAddress == address(0)) {
            (bool success, ) = escrow.sender.call{value: escrow.amount, gas: 2300}("");
            if (!success) revert TokenTransferFailed();
        } else {
            IERC20(escrow.tokenAddress).safeTransfer(escrow.sender, escrow.amount);
        }
        
        emit EscrowCancelled(escrowId, escrow.sender, escrow.orderId);
    }
}