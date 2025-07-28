// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title MockHTLC - Mock HTLC for demo purposes
 * @dev Simplified HTLC implementation for hackathon demo
 */
contract MockHTLC {
    struct Escrow {
        address sender;
        address receiver;
        uint256 amount;
        bytes32 secretHash;
        uint256 timelock;
        bool withdrawn;
        bool cancelled;
        address tokenAddress;
        string orderId;
        uint256 createdAt;
    }

    mapping(bytes32 => Escrow) public escrows;
    uint256 public nextEscrowId = 1;
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        string orderId
    );
    
    event EscrowWithdrawn(bytes32 indexed escrowId, address indexed receiver);
    event EscrowCancelled(bytes32 indexed escrowId, address indexed sender);

    function createEscrow(
        address receiver,
        bytes32 secretHash,
        uint256 timelock,
        string memory orderId
    ) external payable returns (bytes32) {
        require(msg.value > 0, "Amount must be greater than 0");
        require(timelock > block.timestamp, "Timelock must be in future");
        
        bytes32 escrowId = bytes32(nextEscrowId++);
        
        escrows[escrowId] = Escrow({
            sender: msg.sender,
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
        
        emit EscrowCreated(escrowId, msg.sender, receiver, msg.value, orderId);
        return escrowId;
    }

    function withdraw(bytes32 escrowId, string memory secret) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.cancelled, "Already cancelled");
        require(keccak256(abi.encodePacked(secret)) == escrow.secretHash, "Invalid secret");
        
        escrow.withdrawn = true;
        payable(escrow.receiver).transfer(escrow.amount);
        
        emit EscrowWithdrawn(escrowId, escrow.receiver);
    }

    function cancel(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.amount > 0, "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.cancelled, "Already cancelled");
        require(block.timestamp >= escrow.timelock, "Timelock not expired");
        
        escrow.cancelled = true;
        payable(escrow.sender).transfer(escrow.amount);
        
        emit EscrowCancelled(escrowId, escrow.sender);
    }

    function getEscrow(bytes32 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }
}