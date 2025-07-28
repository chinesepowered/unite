// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/HTLCEscrowFixed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("MockToken", "MTK") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

/**
 * @title HTLC Compliance Test Suite
 * @dev Comprehensive tests to verify full HTLC specification compliance
 */
contract HTLCComplianceTest is Test {
    HTLCEscrowFixed public htlc;
    MockERC20 public token;
    
    address public owner = address(0x1);
    address public sender = address(0x2);
    address public receiver = address(0x3);
    address public unauthorized = address(0x4);
    
    bytes32 public secretHash;
    string public secret = "mysecret123";
    uint256 public timelock;
    string public orderId = "order123";
    
    uint256 public constant ESCROW_AMOUNT = 1 ether;
    uint256 public constant TOKEN_AMOUNT = 1000 * 10**18;

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

    function setUp() public {
        vm.startPrank(owner);
        htlc = new HTLCEscrowFixed(owner);
        token = new MockERC20();
        vm.stopPrank();
        
        secretHash = keccak256(abi.encodePacked(secret));
        timelock = block.timestamp + 1 hours;
        
        // Fund test accounts
        vm.deal(sender, 10 ether);
        vm.deal(receiver, 1 ether);
        
        // Transfer tokens to sender
        vm.prank(owner);
        token.transfer(sender, TOKEN_AMOUNT);
    }

    /// @dev Test 1: HTLC Core Functionality - Native Token
    function testHTLCNativeTokenCompliance() public {
        vm.startPrank(sender);
        
        // Create HTLC escrow
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Verify escrow exists and has correct parameters
        (
            address storedSender,
            address storedReceiver,
            uint256 amount,
            bytes32 storedSecretHash,
            uint256 storedTimelock,
            bool withdrawn,
            bool cancelled,
            address tokenAddress,
            string memory storedOrderId,
            uint256 createdAt
        ) = htlc.getEscrow(escrowId);
        
        assertEq(storedSender, sender);
        assertEq(storedReceiver, receiver);
        assertEq(amount, ESCROW_AMOUNT);
        assertEq(storedSecretHash, secretHash);
        assertEq(storedTimelock, timelock);
        assertFalse(withdrawn);
        assertFalse(cancelled);
        assertEq(tokenAddress, address(0));
        assertEq(storedOrderId, orderId);
        assertGt(createdAt, 0);
        
        vm.stopPrank();
    }

    /// @dev Test 2: HTLC Hashlock - Correct Secret Withdrawal
    function testHashlockCorrectSecret() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        uint256 receiverBalanceBefore = receiver.balance;
        
        // Receiver withdraws with correct secret
        vm.prank(receiver);
        htlc.withdraw(escrowId, secret);
        
        // Verify withdrawal succeeded
        (, , , , , bool withdrawn, bool cancelled, , ,) = htlc.getEscrow(escrowId);
        assertTrue(withdrawn);
        assertFalse(cancelled);
        assertEq(receiver.balance, receiverBalanceBefore + ESCROW_AMOUNT);
    }

    /// @dev Test 3: HTLC Hashlock - Wrong Secret Rejection
    function testHashlockWrongSecret() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Receiver tries to withdraw with wrong secret
        vm.prank(receiver);
        vm.expectRevert(HTLCEscrowFixed.InvalidSecret.selector);
        htlc.withdraw(escrowId, "wrongsecret");
    }

    /// @dev Test 4: HTLC Access Control - Only Receiver Can Withdraw
    function testWithdrawAccessControl() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Unauthorized user cannot withdraw even with correct secret
        vm.prank(unauthorized);
        vm.expectRevert(HTLCEscrowFixed.UnauthorizedAccess.selector);
        htlc.withdraw(escrowId, secret);
        
        // Sender cannot withdraw even with correct secret
        vm.prank(sender);
        vm.expectRevert(HTLCEscrowFixed.UnauthorizedAccess.selector);
        htlc.withdraw(escrowId, secret);
    }

    /// @dev Test 5: HTLC Timelock - Early Cancellation Prevention
    function testTimelockEarlyCancellation() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Sender cannot cancel before timelock expires
        vm.prank(sender);
        vm.expectRevert(HTLCEscrowFixed.TimelockNotExpired.selector);
        htlc.cancel(escrowId);
    }

    /// @dev Test 6: HTLC Timelock - Cancellation After Expiry
    function testTimelockCancellationAfterExpiry() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        uint256 senderBalanceBefore = sender.balance;
        
        // Fast forward past timelock
        vm.warp(timelock + 1);
        
        // Sender can now cancel and get refund
        vm.prank(sender);
        htlc.cancel(escrowId);
        
        // Verify cancellation succeeded
        (, , , , , bool withdrawn, bool cancelled, , ,) = htlc.getEscrow(escrowId);
        assertFalse(withdrawn);
        assertTrue(cancelled);
        assertEq(sender.balance, senderBalanceBefore + ESCROW_AMOUNT);
    }

    /// @dev Test 7: HTLC Access Control - Only Sender Can Cancel
    function testCancelAccessControl() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Fast forward past timelock
        vm.warp(timelock + 1);
        
        // Unauthorized user cannot cancel
        vm.prank(unauthorized);
        vm.expectRevert(HTLCEscrowFixed.UnauthorizedAccess.selector);
        htlc.cancel(escrowId);
        
        // Receiver cannot cancel
        vm.prank(receiver);
        vm.expectRevert(HTLCEscrowFixed.UnauthorizedAccess.selector);
        htlc.cancel(escrowId);
    }

    /// @dev Test 8: HTLC Atomicity - No Double Spending
    function testAtomicityNoDoubleSpending() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Receiver withdraws
        vm.prank(receiver);
        htlc.withdraw(escrowId, secret);
        
        // Fast forward past timelock
        vm.warp(timelock + 1);
        
        // Sender cannot cancel after withdrawal
        vm.prank(sender);
        vm.expectRevert(HTLCEscrowFixed.AlreadyWithdrawn.selector);
        htlc.cancel(escrowId);
        
        // Receiver cannot withdraw again
        vm.prank(receiver);
        vm.expectRevert(HTLCEscrowFixed.AlreadyWithdrawn.selector);
        htlc.withdraw(escrowId, secret);
    }

    /// @dev Test 9: ERC20 Token HTLC Compliance
    function testERC20HTLCCompliance() public {
        // Sender approves tokens
        vm.prank(sender);
        token.approve(address(htlc), TOKEN_AMOUNT);
        
        // Create ERC20 HTLC escrow
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowERC20(
            address(token),
            TOKEN_AMOUNT,
            secretHash,
            timelock,
            payable(receiver),
            "token_order123"
        );
        
        uint256 receiverBalanceBefore = token.balanceOf(receiver);
        
        // Receiver withdraws with correct secret
        vm.prank(receiver);
        htlc.withdraw(escrowId, secret);
        
        // Verify token transfer
        assertEq(token.balanceOf(receiver), receiverBalanceBefore + TOKEN_AMOUNT);
        
        // Verify escrow state
        (, , , , , bool withdrawn, bool cancelled, , ,) = htlc.getEscrow(escrowId);
        assertTrue(withdrawn);
        assertFalse(cancelled);
    }

    /// @dev Test 10: Secret Verification Function
    function testSecretVerification() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Correct secret should verify
        assertTrue(htlc.verifySecret(escrowId, secret));
        
        // Wrong secret should not verify
        assertFalse(htlc.verifySecret(escrowId, "wrongsecret"));
    }

    /// @dev Test 11: State Query Functions
    function testStateQueryFunctions() public {
        vm.prank(sender);
        bytes32 escrowId = htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Can withdraw before expiry and processing
        assertTrue(htlc.canWithdraw(escrowId));
        
        // Cannot cancel before expiry
        assertFalse(htlc.canCancel(escrowId));
        
        // Fast forward past timelock
        vm.warp(timelock + 1);
        
        // Can still withdraw (until cancelled)
        assertTrue(htlc.canWithdraw(escrowId));
        
        // Can now cancel
        assertTrue(htlc.canCancel(escrowId));
    }

    /// @dev Test 12: Order ID Uniqueness
    function testOrderIdUniqueness() public {
        vm.startPrank(sender);
        
        // Create first escrow
        htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Cannot create another escrow with same order ID
        vm.expectRevert(HTLCEscrowFixed.OrderIdAlreadyUsed.selector);
        htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock + 1,
            payable(receiver),
            orderId
        );
        
        vm.stopPrank();
    }

    /// @dev Test 13: Input Validation
    function testInputValidation() public {
        vm.startPrank(sender);
        
        // Zero amount should fail
        vm.expectRevert(HTLCEscrowFixed.InvalidAmount.selector);
        htlc.createHTLCEscrowNative{value: 0}(
            secretHash,
            timelock,
            payable(receiver),
            orderId
        );
        
        // Past timelock should fail
        vm.expectRevert(HTLCEscrowFixed.TimelockMustBeFuture.selector);
        htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            block.timestamp - 1,
            payable(receiver),
            orderId
        );
        
        // Zero receiver address should fail
        vm.expectRevert(HTLCEscrowFixed.InvalidAddress.selector);
        htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(address(0)),
            orderId
        );
        
        // Empty order ID should fail
        vm.expectRevert(HTLCEscrowFixed.InvalidAmount.selector);
        htlc.createHTLCEscrowNative{value: ESCROW_AMOUNT}(
            secretHash,
            timelock,
            payable(receiver),
            ""
        );
        
        vm.stopPrank();
    }
}