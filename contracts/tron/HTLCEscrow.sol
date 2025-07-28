// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * @title HTLCEscrow for Tron Network
 * @dev Production-ready HTLC implementation for TRX and TRC20 tokens
 * Enforces atomic cross-chain swaps with proper hashlock and timelock
 */
contract HTLCEscrow {
    
    struct Escrow {
        address payable sender;
        address payable receiver;
        uint256 amount;
        bytes32 secretHash;
        uint256 timelock;
        bool withdrawn;
        bool cancelled;
        address tokenAddress; // address(0) for TRX, token contract for TRC20
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

    // Modifiers
    modifier escrowExists(bytes32 escrowId) {
        require(escrows[escrowId].amount > 0, "Escrow does not exist");
        _;
    }

    modifier notWithdrawn(bytes32 escrowId) {
        require(!escrows[escrowId].withdrawn, "Already withdrawn");
        _;
    }

    modifier notCancelled(bytes32 escrowId) {
        require(!escrows[escrowId].cancelled, "Already cancelled");
        _;
    }

    modifier onlyReceiver(bytes32 escrowId) {
        require(msg.sender == escrows[escrowId].receiver, "Only receiver can withdraw");
        _;
    }

    modifier onlySender(bytes32 escrowId) {
        require(msg.sender == escrows[escrowId].sender, "Only sender can cancel");
        _;
    }

    modifier timelockExpired(bytes32 escrowId) {
        require(block.timestamp >= escrows[escrowId].timelock, "Timelock not expired");
        _;
    }

    /**
     * @dev Create HTLC escrow with TRX (native token)
     */
    function createHTLCEscrowTRX(
        bytes32 secretHash,
        uint256 timelock,
        address payable receiver,
        string memory orderId
    ) external payable returns (bytes32) {
        require(msg.value > 0, "Amount must be greater than 0");
        require(timelock > block.timestamp, "Timelock must be in future");
        require(bytes(orderId).length > 0, "Order ID required");
        require(receiver != address(0), "Invalid receiver address");
        
        bytes32 escrowId = keccak256(abi.encodePacked(
            msg.sender,
            receiver,
            msg.value,
            secretHash,
            timelock,
            orderId,
            block.timestamp
        ));
        
        require(escrows[escrowId].amount == 0, "Escrow already exists");
        require(orderToEscrowId[orderId] == bytes32(0), "Order ID already used");
        
        escrows[escrowId] = Escrow({
            sender: payable(msg.sender),
            receiver: receiver,
            amount: msg.value,
            secretHash: secretHash,
            timelock: timelock,
            withdrawn: false,
            cancelled: false,
            tokenAddress: address(0), // Native TRX
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
     * @dev Create HTLC escrow with TRC20 token
     */
    function createHTLCEscrowTRC20(
        address tokenAddress,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address payable receiver,
        string memory orderId
    ) external returns (bytes32) {
        require(tokenAddress != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(timelock > block.timestamp, "Timelock must be in future");
        require(bytes(orderId).length > 0, "Order ID required");
        require(receiver != address(0), "Invalid receiver address");
        
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
        
        require(escrows[escrowId].amount == 0, "Escrow already exists");
        require(orderToEscrowId[orderId] == bytes32(0), "Order ID already used");
        
        // Transfer tokens to this contract
        require(
            ITRC20(tokenAddress).transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );
        
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
     * @dev Withdraw funds by providing the secret
     */
    function withdraw(
        bytes32 escrowId,
        string memory secret
    ) 
        external 
        escrowExists(escrowId)
        notWithdrawn(escrowId)
        notCancelled(escrowId)
        onlyReceiver(escrowId)
    {
        Escrow storage escrow = escrows[escrowId];
        
        // Verify secret
        require(
            keccak256(abi.encodePacked(secret)) == escrow.secretHash,
            "Invalid secret"
        );
        
        escrow.withdrawn = true;
        
        // Transfer funds to receiver
        if (escrow.tokenAddress == address(0)) {
            // Native TRX transfer
            escrow.receiver.transfer(escrow.amount);
        } else {
            // TRC20 token transfer
            require(
                ITRC20(escrow.tokenAddress).transfer(escrow.receiver, escrow.amount),
                "Token transfer failed"
            );
        }
        
        emit EscrowWithdrawn(
            escrowId,
            escrow.receiver,
            keccak256(abi.encodePacked(secret)),
            escrow.orderId
        );
    }

    /**
     * @dev Cancel escrow and refund sender after timelock expires
     */
    function cancel(
        bytes32 escrowId
    ) 
        external 
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
            // Native TRX refund
            escrow.sender.transfer(escrow.amount);
        } else {
            // TRC20 token refund
            require(
                ITRC20(escrow.tokenAddress).transfer(escrow.sender, escrow.amount),
                "Token transfer failed"
            );
        }
        
        emit EscrowCancelled(escrowId, escrow.sender, escrow.orderId);
    }

    /**
     * @dev Get escrow details by ID
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
     * @dev Verify if secret matches the hash
     */
    function verifySecret(bytes32 escrowId, string memory secret) external view returns (bool) {
        if (escrows[escrowId].amount == 0) return false;
        return keccak256(abi.encodePacked(secret)) == escrows[escrowId].secretHash;
    }

    /**
     * @dev Check if escrow can be cancelled
     */
    function canCancel(bytes32 escrowId) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.withdrawn && 
               !escrow.cancelled &&
               block.timestamp >= escrow.timelock;
    }

    /**
     * @dev Check if escrow can be withdrawn (requires valid secret)
     */
    function canWithdraw(bytes32 escrowId) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.withdrawn && 
               !escrow.cancelled;
    }
}

/**
 * @dev TRC20 token interface for Tron
 */
interface ITRC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}