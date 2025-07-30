"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuiAdapter = void 0;
const client_1 = require("@mysten/sui.js/client");
const transactions_1 = require("@mysten/sui.js/transactions");
const ed25519_1 = require("@mysten/sui.js/keypairs/ed25519");
const bcs_1 = require("@mysten/bcs");
const types_1 = require("../core/types");
const crypto_1 = require("crypto");
class SuiAdapter extends types_1.ChainAdapter {
    constructor(config, privateKey) {
        super(config);
        this.client = new client_1.SuiClient({ url: config.rpcUrl });
        if (privateKey) {
            // Convert hex private key to Uint8Array for Sui
            const keyBytes = privateKey.startsWith('0x')
                ? (0, bcs_1.fromB64)(Buffer.from(privateKey.slice(2), 'hex').toString('base64'))
                : (0, bcs_1.fromB64)(privateKey);
            this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(keyBytes);
        }
    }
    async deployEscrow(order, side) {
        if (!this.keypair) {
            throw new Error('Keypair not configured for Sui adapter');
        }
        try {
            const txb = new transactions_1.TransactionBlock();
            const userAddress = this.keypair.toSuiAddress();
            // Create escrow object with HTLC logic
            const amount = side === 'src' ? order.makingAmount : order.takingAmount;
            const tokenType = side === 'src' ? order.makerAsset : order.takerAsset;
            // For simplicity, assume SUI native token or a specific token contract
            const escrowModule = this.config.escrowFactory || 'ESCROW_PACKAGE_ID';
            // Create escrow with hashlock and timelock
            const currentTime = Date.now();
            const timelock = side === 'src'
                ? Number(order.timelock.srcCancellation) * 1000 + currentTime
                : Number(order.timelock.dstCancellation) * 1000 + currentTime;
            if (tokenType === '0x2::sui::SUI' || !tokenType.includes('::')) {
                // Native SUI transfer to escrow
                const [coin] = txb.splitCoins(txb.gas, [amount]);
                // Move call to create escrow
                txb.moveCall({
                    target: `${escrowModule}::escrow::create_htlc_escrow`,
                    arguments: [
                        coin,
                        txb.pure(order.secretHash),
                        txb.pure(timelock),
                        txb.pure(order.maker),
                        txb.pure(userAddress), // receiver
                        txb.pure(order.orderId)
                    ],
                });
            }
            else {
                // Custom token transfer
                // This would require the token's coin object and proper type parameters
                throw new Error('Custom tokens not yet implemented for Sui');
            }
            // Set gas budget and execute
            txb.setGasBudget(1000000);
            const result = await this.client.signAndExecuteTransactionBlock({
                signer: this.keypair,
                transactionBlock: txb,
                options: {
                    showEffects: true,
                    showObjectChanges: true,
                },
            });
            if (result.effects?.status?.status !== 'success') {
                throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
            }
            // Extract escrow object ID from object changes
            const escrowObjectId = this.extractEscrowObjectId(result);
            const immutables = {
                orderHash: order.orderId,
                secretHash: order.secretHash,
                maker: order.maker,
                receiver: userAddress,
                srcToken: order.makerAsset,
                dstToken: order.takerAsset,
                srcAmount: order.makingAmount,
                dstAmount: order.takingAmount,
                timelock: timelock,
                suiTxDigest: result.digest
            };
            return {
                address: escrowObjectId,
                immutables,
                deployedAt: BigInt(Math.floor(currentTime / 1000))
            };
        }
        catch (error) {
            throw new Error(`Failed to deploy Sui escrow: ${error.message}`);
        }
    }
    async withdraw(escrow, secret) {
        if (!this.keypair) {
            throw new Error('Keypair not configured');
        }
        try {
            // Verify secret hash
            const secretHash = (0, crypto_1.createHash)('sha256').update(secret).digest('hex');
            if (secretHash !== escrow.immutables.secretHash.slice(2)) {
                throw new Error('Invalid secret provided');
            }
            const txb = new transactions_1.TransactionBlock();
            const escrowModule = this.config.escrowFactory || 'ESCROW_PACKAGE_ID';
            // Call withdraw function with secret
            txb.moveCall({
                target: `${escrowModule}::escrow::withdraw_with_secret`,
                arguments: [
                    txb.object(escrow.address),
                    txb.pure(secret),
                    txb.pure(this.keypair.toSuiAddress())
                ],
            });
            txb.setGasBudget(1000000);
            const result = await this.client.signAndExecuteTransactionBlock({
                signer: this.keypair,
                transactionBlock: txb,
                options: {
                    showEffects: true,
                },
            });
            if (result.effects?.status?.status !== 'success') {
                throw new Error(`Withdrawal failed: ${result.effects?.status?.error}`);
            }
            return result.digest;
        }
        catch (error) {
            throw new Error(`Failed to withdraw from Sui escrow: ${error.message}`);
        }
    }
    async cancel(escrow) {
        if (!this.keypair) {
            throw new Error('Keypair not configured');
        }
        try {
            // Check if timelock has expired
            const currentTime = Date.now();
            if (currentTime < escrow.immutables.timelock) {
                throw new Error('Cannot cancel escrow before timelock expiry');
            }
            const txb = new transactions_1.TransactionBlock();
            const escrowModule = this.config.escrowFactory || 'ESCROW_PACKAGE_ID';
            // Call cancel function
            txb.moveCall({
                target: `${escrowModule}::escrow::cancel_expired_escrow`,
                arguments: [
                    txb.object(escrow.address),
                    txb.pure(this.keypair.toSuiAddress())
                ],
            });
            txb.setGasBudget(1000000);
            const result = await this.client.signAndExecuteTransactionBlock({
                signer: this.keypair,
                transactionBlock: txb,
                options: {
                    showEffects: true,
                },
            });
            if (result.effects?.status?.status !== 'success') {
                throw new Error(`Cancellation failed: ${result.effects?.status?.error}`);
            }
            return result.digest;
        }
        catch (error) {
            throw new Error(`Failed to cancel Sui escrow: ${error.message}`);
        }
    }
    async getBalance(address, tokenAddress) {
        try {
            if (tokenAddress === '0x2::sui::SUI' || !tokenAddress.includes('::')) {
                // Get SUI balance
                const balance = await this.client.getBalance({
                    owner: address,
                    coinType: '0x2::sui::SUI'
                });
                return BigInt(balance.totalBalance);
            }
            else {
                // Get custom token balance
                const balance = await this.client.getBalance({
                    owner: address,
                    coinType: tokenAddress
                });
                return BigInt(balance.totalBalance);
            }
        }
        catch (error) {
            throw new Error(`Failed to get Sui balance: ${error.message}`);
        }
    }
    async getBlockTimestamp() {
        try {
            // Get latest checkpoint
            const checkpoint = await this.client.getLatestCheckpointSequenceNumber();
            const checkpointData = await this.client.getCheckpoint({
                id: checkpoint
            });
            return BigInt(Math.floor(parseInt(checkpointData.timestampMs) / 1000));
        }
        catch (error) {
            throw new Error(`Failed to get Sui block timestamp: ${error.message}`);
        }
    }
    isChainSupported() {
        return true;
    }
    extractEscrowObjectId(result) {
        // Extract the created escrow object ID from transaction effects
        const createdObjects = result.objectChanges?.filter(change => change.type === 'created');
        if (!createdObjects || createdObjects.length === 0) {
            throw new Error('No escrow object created in transaction');
        }
        // Return the first created object (assumes it's the escrow)
        const escrowObject = createdObjects.find(obj => obj.objectType?.includes('escrow') ||
            obj.objectType?.includes('Escrow'));
        if (!escrowObject) {
            // Fallback to first created object
            return createdObjects[0].objectId;
        }
        return escrowObject.objectId;
    }
}
exports.SuiAdapter = SuiAdapter;
