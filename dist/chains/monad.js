"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonadAdapter = void 0;
const ethers_1 = require("ethers");
const types_1 = require("../core/types");
class MonadAdapter extends types_1.ChainAdapter {
    constructor(config, privateKey) {
        super(config);
        this.provider = new ethers_1.JsonRpcProvider(config.rpcUrl, parseInt(config.chainId));
        if (privateKey) {
            this.wallet = new ethers_1.Wallet(privateKey, this.provider);
        }
    }
    async deployEscrow(order, side) {
        if (!this.wallet) {
            throw new Error('Wallet not configured for Monad adapter');
        }
        try {
            // Deploy or get existing HTLC contract
            const escrowContract = await this.getOrDeployEscrowContract();
            const amount = side === 'src' ? order.makingAmount : order.takingAmount;
            const tokenAddress = side === 'src' ? order.makerAsset : order.takerAsset;
            // Calculate timelock
            const currentTime = Math.floor(Date.now() / 1000);
            const timelock = side === 'src'
                ? Number(order.timelock.srcCancellation) + currentTime
                : Number(order.timelock.dstCancellation) + currentTime;
            let tx;
            if (this.isNativeToken(tokenAddress)) {
                // Native token (MON) escrow
                tx = await escrowContract.createHTLCEscrowMON(order.secretHash, timelock, order.maker, this.wallet.address, // receiver
                order.orderId, { value: amount });
            }
            else {
                // ERC20 token escrow
                const tokenContract = new ethers_1.ethers.Contract(tokenAddress, ['function approve(address spender, uint256 amount) returns (bool)'], this.wallet);
                // First approve the escrow contract
                const approveTx = await tokenContract.approve(await escrowContract.getAddress(), amount);
                await approveTx.wait();
                // Then create the escrow
                tx = await escrowContract.createHTLCEscrowERC20(tokenAddress, amount, order.secretHash, timelock, order.maker, this.wallet.address, // receiver
                order.orderId);
            }
            const receipt = await tx.wait();
            // Extract escrow ID from logs
            const escrowId = this.extractEscrowIdFromLogs(receipt.logs);
            const immutables = {
                escrowId,
                orderHash: order.orderId,
                secretHash: order.secretHash,
                maker: order.maker,
                receiver: this.wallet.address,
                srcToken: order.makerAsset,
                dstToken: order.takerAsset,
                srcAmount: order.makingAmount,
                dstAmount: order.takingAmount,
                timelock: timelock,
                contractAddress: await escrowContract.getAddress(),
                monadTxHash: receipt.hash
            };
            return {
                address: await escrowContract.getAddress(),
                immutables,
                deployedAt: BigInt(currentTime)
            };
        }
        catch (error) {
            throw new Error(`Failed to deploy Monad escrow: ${error.message}`);
        }
    }
    async withdraw(escrow, secret) {
        if (!this.wallet) {
            throw new Error('Wallet not configured');
        }
        try {
            // Verify secret hash
            const secretHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(secret));
            if (secretHash !== escrow.immutables.secretHash) {
                throw new Error('Invalid secret provided');
            }
            const contract = new ethers_1.ethers.Contract(escrow.address, ['function withdraw(bytes32 escrowId, string memory secret)'], this.wallet);
            const tx = await contract.withdraw(escrow.immutables.escrowId, secret);
            const receipt = await tx.wait();
            return receipt.hash;
        }
        catch (error) {
            throw new Error(`Failed to withdraw from Monad escrow: ${error.message}`);
        }
    }
    async cancel(escrow) {
        if (!this.wallet) {
            throw new Error('Wallet not configured');
        }
        try {
            // Check if timelock has expired
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime < escrow.immutables.timelock) {
                throw new Error('Cannot cancel escrow before timelock expiry');
            }
            const contract = new ethers_1.ethers.Contract(escrow.address, ['function cancel(bytes32 escrowId)'], this.wallet);
            const tx = await contract.cancel(escrow.immutables.escrowId);
            const receipt = await tx.wait();
            return receipt.hash;
        }
        catch (error) {
            throw new Error(`Failed to cancel Monad escrow: ${error.message}`);
        }
    }
    async getBalance(address, tokenAddress) {
        if (this.isNativeToken(tokenAddress)) {
            // Native MON balance
            return await this.provider.getBalance(address);
        }
        else {
            // ERC20 token balance
            const tokenContract = new ethers_1.ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], this.provider);
            return await tokenContract.balanceOf(address);
        }
    }
    async getBlockTimestamp() {
        const block = await this.provider.getBlock('latest');
        return BigInt(block.timestamp);
    }
    isChainSupported() {
        return true; // Monad is EVM-compatible
    }
    isNativeToken(tokenAddress) {
        return !tokenAddress ||
            tokenAddress === ethers_1.ethers.ZeroAddress ||
            tokenAddress === 'MON' ||
            tokenAddress === 'native';
    }
    async getOrDeployEscrowContract() {
        if (!this.wallet) {
            throw new Error('Wallet not configured');
        }
        // Check if escrow contract is already configured
        if (this.config.escrowFactory) {
            return new ethers_1.ethers.Contract(this.config.escrowFactory, this.getEscrowABI(), this.wallet);
        }
        // Deploy new escrow contract
        const factory = new ethers_1.ethers.ContractFactory(this.getEscrowABI(), this.getEscrowBytecode(), this.wallet);
        const contract = await factory.deploy();
        await contract.waitForDeployment();
        // Update config with deployed contract address
        this.config.escrowFactory = await contract.getAddress();
        return contract;
    }
    extractEscrowIdFromLogs(logs) {
        // Find EscrowCreated event log
        const escrowCreatedTopic = ethers_1.ethers.id('EscrowCreated(bytes32,address,address,uint256)');
        const log = logs.find(log => log.topics && log.topics[0] === escrowCreatedTopic);
        if (log && log.topics.length > 1) {
            return log.topics[1]; // Escrow ID should be in second topic
        }
        // Fallback to generating ID from transaction
        return ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(`escrow_${Date.now()}_${Math.random()}`));
    }
    getEscrowABI() {
        return [
            'function createHTLCEscrowMON(bytes32 secretHash, uint256 timelock, address receiver, string memory orderId) payable returns (bytes32)',
            'function createHTLCEscrowERC20(address tokenAddress, uint256 amount, bytes32 secretHash, uint256 timelock, address sender, address receiver, string memory orderId) returns (bytes32)',
            'function withdraw(bytes32 escrowId, string memory secret)',
            'function cancel(bytes32 escrowId)',
            'event EscrowCreated(bytes32 indexed escrowId, address indexed sender, address indexed receiver, uint256 amount)',
            'event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret)',
            'event EscrowCancelled(bytes32 indexed escrowId)'
        ];
    }
    getEscrowBytecode() {
        // This would contain the compiled bytecode of the HTLC contract
        // For now, return a placeholder - in practice, this would be the actual compiled contract
        return '0x608060405234801561001057600080fd5b50...'; // Placeholder bytecode
    }
}
exports.MonadAdapter = MonadAdapter;
