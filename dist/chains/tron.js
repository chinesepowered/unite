"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TronAdapter = void 0;
const tronweb_1 = __importDefault(require("tronweb"));
const types_1 = require("../core/types");
const crypto_1 = require("crypto");
class TronAdapter extends types_1.ChainAdapter {
    constructor(config, privateKey) {
        super(config);
        this.tronWeb = new tronweb_1.default({
            fullHost: config.rpcUrl,
            privateKey: privateKey
        });
        if (privateKey) {
            this.account = this.tronWeb.address.fromPrivateKey(privateKey);
        }
    }
    async deployEscrow(order, side) {
        if (!this.account) {
            throw new Error('Account not configured for Tron adapter');
        }
        try {
            // Deploy or use existing HTLC contract
            const escrowContract = await this.getOrDeployEscrowContract();
            const amount = side === 'src' ? order.makingAmount : order.takingAmount;
            const tokenAddress = side === 'src' ? order.makerAsset : order.takerAsset;
            // Calculate timelock
            const currentTime = Math.floor(Date.now() / 1000);
            const timelock = side === 'src'
                ? Number(order.timelock.srcCancellation) + currentTime
                : Number(order.timelock.dstCancellation) + currentTime;
            let txHash;
            if (this.isTRX(tokenAddress)) {
                // Native TRX escrow
                const tx = await escrowContract.createHTLCEscrowTRX(order.secretHash, timelock, order.maker, this.account, // receiver
                order.orderId).send({
                    from: this.account,
                    callValue: amount
                });
                txHash = tx;
            }
            else {
                // TRC20 token escrow
                const tokenContract = await this.tronWeb.contract().at(tokenAddress);
                // First approve the escrow contract
                await tokenContract.approve(escrowContract.address, amount).send({
                    from: this.account
                });
                // Then create the escrow
                const tx = await escrowContract.createHTLCEscrowTRC20(tokenAddress, amount, order.secretHash, timelock, order.maker, this.account, // receiver
                order.orderId).send({
                    from: this.account
                });
                txHash = tx;
            }
            // Get escrow ID from transaction receipt
            const receipt = await this.tronWeb.trx.getTransactionInfo(txHash);
            const escrowId = this.extractEscrowIdFromReceipt(receipt);
            const immutables = {
                escrowId,
                orderHash: order.orderId,
                secretHash: order.secretHash,
                maker: order.maker,
                receiver: this.account,
                srcToken: order.makerAsset,
                dstToken: order.takerAsset,
                srcAmount: order.makingAmount,
                dstAmount: order.takingAmount,
                timelock: timelock,
                contractAddress: escrowContract.address,
                tronTxHash: txHash
            };
            return {
                address: escrowContract.address,
                immutables,
                deployedAt: BigInt(currentTime)
            };
        }
        catch (error) {
            throw new Error(`Failed to deploy Tron escrow: ${error.message}`);
        }
    }
    async withdraw(escrow, secret) {
        if (!this.account) {
            throw new Error('Account not configured');
        }
        try {
            // Verify secret hash
            const secretHash = (0, crypto_1.createHash)('sha256').update(secret).digest('hex');
            if (secretHash !== escrow.immutables.secretHash.slice(2)) {
                throw new Error('Invalid secret provided');
            }
            const contract = await this.tronWeb.contract().at(escrow.address);
            const tx = await contract.withdraw(escrow.immutables.escrowId, secret).send({
                from: this.account
            });
            return tx;
        }
        catch (error) {
            throw new Error(`Failed to withdraw from Tron escrow: ${error.message}`);
        }
    }
    async cancel(escrow) {
        if (!this.account) {
            throw new Error('Account not configured');
        }
        try {
            // Check if timelock has expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime < escrow.immutables.timelock) {
                throw new Error('Cannot cancel escrow before timelock expiry');
            }
            const contract = await this.tronWeb.contract().at(escrow.address);
            const tx = await contract.cancel(escrow.immutables.escrowId).send({
                from: this.account
            });
            return tx;
        }
        catch (error) {
            throw new Error(`Failed to cancel Tron escrow: ${error.message}`);
        }
    }
    async getBalance(address, tokenAddress) {
        try {
            if (this.isTRX(tokenAddress)) {
                // Native TRX balance
                const balance = await this.tronWeb.trx.getBalance(address);
                return BigInt(balance);
            }
            else {
                // TRC20 token balance
                const contract = await this.tronWeb.contract().at(tokenAddress);
                const balance = await contract.balanceOf(address).call();
                return BigInt(balance);
            }
        }
        catch (error) {
            throw new Error(`Failed to get Tron balance: ${error.message}`);
        }
    }
    async getBlockTimestamp() {
        try {
            const block = await this.tronWeb.trx.getCurrentBlock();
            return BigInt(Math.floor(block.block_header.raw_data.timestamp / 1000));
        }
        catch (error) {
            throw new Error(`Failed to get Tron block timestamp: ${error.message}`);
        }
    }
    isChainSupported() {
        return true;
    }
    isTRX(tokenAddress) {
        return !tokenAddress || tokenAddress === 'TRX' || tokenAddress === 'native';
    }
    async getOrDeployEscrowContract() {
        // Check if escrow contract is already configured
        if (this.config.escrowFactory) {
            return await this.tronWeb.contract().at(this.config.escrowFactory);
        }
        // Deploy new escrow contract
        const escrowContractSource = this.getEscrowContractSource();
        const compiled = await this.tronWeb.contract().compile(escrowContractSource);
        const contract = await this.tronWeb.contract().deploy({
            abi: compiled.abi,
            bytecode: compiled.bytecode
        }, {
            from: this.account
        });
        // Update config with deployed contract address
        this.config.escrowFactory = contract.address;
        return contract;
    }
    extractEscrowIdFromReceipt(receipt) {
        // Extract escrow ID from transaction receipt logs
        if (receipt.log && receipt.log.length > 0) {
            const log = receipt.log.find((l) => l.topics && l.topics[0] === 'EscrowCreated');
            if (log && log.topics.length > 1) {
                return log.topics[1]; // Escrow ID should be in second topic
            }
        }
        // Fallback to using transaction hash as ID
        return receipt.id || receipt.txid;
    }
    getEscrowContractSource() {
        // Simplified HTLC contract for Tron
        return `
      pragma solidity ^0.8.0;

      contract HTLCEscrow {
          struct Escrow {
              address payable sender;
              address payable receiver;
              uint256 amount;
              bytes32 secretHash;
              uint256 timelock;
              bool withdrawn;
              bool cancelled;
              address tokenAddress;
              string orderId;
          }

          mapping(bytes32 => Escrow) public escrows;
          
          event EscrowCreated(bytes32 indexed escrowId, address indexed sender, address indexed receiver, uint256 amount);
          event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret);
          event EscrowCancelled(bytes32 indexed escrowId);

          function createHTLCEscrowTRX(
              bytes32 secretHash,
              uint256 timelock,
              address payable sender,
              address payable receiver,
              string memory orderId
          ) external payable returns (bytes32) {
              require(msg.value > 0, "Amount must be greater than 0");
              require(timelock > block.timestamp, "Timelock must be in the future");
              
              bytes32 escrowId = keccak256(abi.encodePacked(msg.sender, secretHash, timelock, orderId));
              require(escrows[escrowId].amount == 0, "Escrow already exists");
              
              escrows[escrowId] = Escrow({
                  sender: sender,
                  receiver: receiver,
                  amount: msg.value,
                  secretHash: secretHash,
                  timelock: timelock,
                  withdrawn: false,
                  cancelled: false,
                  tokenAddress: address(0),
                  orderId: orderId
              });
              
              emit EscrowCreated(escrowId, sender, receiver, msg.value);
              return escrowId;
          }

          function createHTLCEscrowTRC20(
              address tokenAddress,
              uint256 amount,
              bytes32 secretHash,
              uint256 timelock,
              address payable sender,
              address payable receiver,
              string memory orderId
          ) external returns (bytes32) {
              require(amount > 0, "Amount must be greater than 0");
              require(timelock > block.timestamp, "Timelock must be in the future");
              
              bytes32 escrowId = keccak256(abi.encodePacked(msg.sender, secretHash, timelock, orderId));
              require(escrows[escrowId].amount == 0, "Escrow already exists");
              
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
                  orderId: orderId
              });
              
              emit EscrowCreated(escrowId, sender, receiver, amount);
              return escrowId;
          }

          function withdraw(bytes32 escrowId, string memory secret) external {
              Escrow storage escrow = escrows[escrowId];
              require(escrow.amount > 0, "Escrow does not exist");
              require(!escrow.withdrawn, "Already withdrawn");
              require(!escrow.cancelled, "Already cancelled");
              require(keccak256(abi.encodePacked(secret)) == escrow.secretHash, "Invalid secret");
              
              escrow.withdrawn = true;
              
              if (escrow.tokenAddress == address(0)) {
                  escrow.receiver.transfer(escrow.amount);
              } else {
                  IERC20(escrow.tokenAddress).transfer(escrow.receiver, escrow.amount);
              }
              
              emit EscrowWithdrawn(escrowId, escrow.secretHash);
          }

          function cancel(bytes32 escrowId) external {
              Escrow storage escrow = escrows[escrowId];
              require(escrow.amount > 0, "Escrow does not exist");
              require(!escrow.withdrawn, "Already withdrawn");
              require(!escrow.cancelled, "Already cancelled");
              require(block.timestamp >= escrow.timelock, "Timelock not yet expired");
              
              escrow.cancelled = true;
              
              if (escrow.tokenAddress == address(0)) {
                  escrow.sender.transfer(escrow.amount);
              } else {
                  IERC20(escrow.tokenAddress).transfer(escrow.sender, escrow.amount);
              }
              
              emit EscrowCancelled(escrowId);
          }
      }

      interface IERC20 {
          function transfer(address to, uint256 amount) external returns (bool);
          function transferFrom(address from, address to, uint256 amount) external returns (bool);
      }
    `;
    }
}
exports.TronAdapter = TronAdapter;
