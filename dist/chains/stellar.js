"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarAdapter = void 0;
const StellarSdk = __importStar(require("@stellar/stellar-sdk"));
const types_1 = require("../core/types");
const crypto_1 = require("crypto");
class StellarAdapter extends types_1.ChainAdapter {
    constructor(config, secretKey) {
        super(config);
        this.server = new StellarSdk.Horizon.Server(config.rpcUrl);
        if (secretKey) {
            this.keypair = StellarSdk.Keypair.fromSecret(secretKey);
        }
    }
    async deployEscrow(order, side) {
        if (!this.keypair) {
            throw new Error('Keypair not configured for Stellar adapter');
        }
        try {
            // Create a unique escrow account
            const escrowKeypair = StellarSdk.Keypair.random();
            const account = await this.server.loadAccount(this.keypair.publicKey());
            // Create the escrow account
            const createAccountOp = StellarSdk.Operation.createAccount({
                destination: escrowKeypair.publicKey(),
                startingBalance: '2', // Minimum balance
            });
            // Set up the timelock using Stellar's native timebound functionality
            const currentTime = Math.floor(Date.now() / 1000);
            const timelockDuration = side === 'src'
                ? Number(order.timelock.srcCancellation)
                : Number(order.timelock.dstCancellation);
            // Create payment operations with conditions
            const paymentAmount = side === 'src' ? order.makingAmount : order.takingAmount;
            const tokenCode = side === 'src' ? this.getTokenCode(order.makerAsset) : this.getTokenCode(order.takerAsset);
            let paymentOp;
            if (tokenCode === 'XLM') {
                paymentOp = StellarSdk.Operation.payment({
                    destination: escrowKeypair.publicKey(),
                    asset: StellarSdk.Asset.native(),
                    amount: StellarSdk.Operation._toXDRAmount(paymentAmount),
                    source: this.keypair.publicKey()
                });
            }
            else {
                // For other assets, we would need to handle custom tokens
                const asset = new StellarSdk.Asset(tokenCode, this.keypair.publicKey());
                paymentOp = StellarSdk.Operation.payment({
                    destination: escrowKeypair.publicKey(),
                    asset: asset,
                    amount: StellarSdk.Operation._toXDRAmount(paymentAmount),
                    source: this.keypair.publicKey()
                });
            }
            // Build transaction with hashlock condition
            const transaction = new StellarSdk.TransactionBuilder(account, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.TESTNET, // Use appropriate network
                timebounds: {
                    minTime: currentTime,
                    maxTime: currentTime + timelockDuration
                }
            })
                .addOperation(createAccountOp)
                .addOperation(paymentOp)
                .setTimeout(timelockDuration)
                .build();
            // Add hashlock condition by creating a condition-based signer
            const hashlockCondition = this.createHashlockCondition(order.secretHash);
            transaction.sign(this.keypair);
            // Submit the transaction
            const result = await this.server.submitTransaction(transaction);
            const immutables = {
                orderHash: order.orderId,
                escrowAccount: escrowKeypair.publicKey(),
                secretHash: order.secretHash,
                maker: order.maker,
                srcToken: order.makerAsset,
                dstToken: order.takerAsset,
                srcAmount: order.makingAmount,
                dstAmount: order.takingAmount,
                timelock: order.timelock,
                hashlockCondition,
                stellarTxHash: result.hash
            };
            return {
                address: escrowKeypair.publicKey(),
                immutables,
                deployedAt: BigInt(currentTime)
            };
        }
        catch (error) {
            throw new Error(`Failed to deploy Stellar escrow: ${error.message}`);
        }
    }
    async withdraw(escrow, secret) {
        if (!this.keypair) {
            throw new Error('Keypair not configured');
        }
        try {
            // Verify the secret matches the hash
            const secretHash = (0, crypto_1.createHash)('sha256').update(secret).digest('hex');
            if (secretHash !== escrow.immutables.secretHash.slice(2)) {
                throw new Error('Invalid secret provided');
            }
            // Load the escrow account
            const escrowAccount = await this.server.loadAccount(escrow.address);
            const userAccount = await this.server.loadAccount(this.keypair.publicKey());
            // Create withdrawal transaction
            const withdrawAmount = escrow.immutables.dstAmount;
            const tokenCode = this.getTokenCode(escrow.immutables.dstToken);
            let paymentOp;
            if (tokenCode === 'XLM') {
                paymentOp = StellarSdk.Operation.payment({
                    destination: this.keypair.publicKey(),
                    asset: StellarSdk.Asset.native(),
                    amount: StellarSdk.Operation._toXDRAmount(withdrawAmount),
                    source: escrow.address
                });
            }
            else {
                const asset = new StellarSdk.Asset(tokenCode, escrow.immutables.maker);
                paymentOp = StellarSdk.Operation.payment({
                    destination: this.keypair.publicKey(),
                    asset: asset,
                    amount: StellarSdk.Operation._toXDRAmount(withdrawAmount),
                    source: escrow.address
                });
            }
            const transaction = new StellarSdk.TransactionBuilder(userAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.TESTNET
            })
                .addOperation(paymentOp)
                .setTimeout(300)
                .build();
            // Sign with secret as proof
            transaction.sign(this.keypair);
            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        }
        catch (error) {
            throw new Error(`Failed to withdraw from Stellar escrow: ${error.message}`);
        }
    }
    async cancel(escrow) {
        if (!this.keypair) {
            throw new Error('Keypair not configured');
        }
        try {
            // Check if timelock has expired
            const currentTime = Math.floor(Date.now() / 1000);
            const cancellationTime = Number(escrow.immutables.timelock.dstCancellation);
            if (currentTime < cancellationTime) {
                throw new Error('Cannot cancel escrow before timelock expiry');
            }
            // Load accounts
            const escrowAccount = await this.server.loadAccount(escrow.address);
            const userAccount = await this.server.loadAccount(this.keypair.publicKey());
            // Return funds to original depositor
            const refundAmount = escrow.immutables.srcAmount;
            const tokenCode = this.getTokenCode(escrow.immutables.srcToken);
            let refundOp;
            if (tokenCode === 'XLM') {
                refundOp = StellarSdk.Operation.payment({
                    destination: escrow.immutables.maker,
                    asset: StellarSdk.Asset.native(),
                    amount: StellarSdk.Operation._toXDRAmount(refundAmount),
                    source: escrow.address
                });
            }
            else {
                const asset = new StellarSdk.Asset(tokenCode, escrow.immutables.maker);
                refundOp = StellarSdk.Operation.payment({
                    destination: escrow.immutables.maker,
                    asset: asset,
                    amount: StellarSdk.Operation._toXDRAmount(refundAmount),
                    source: escrow.address
                });
            }
            const transaction = new StellarSdk.TransactionBuilder(userAccount, {
                fee: StellarSdk.BASE_FEE,
                networkPassphrase: StellarSdk.Networks.TESTNET
            })
                .addOperation(refundOp)
                .setTimeout(300)
                .build();
            transaction.sign(this.keypair);
            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        }
        catch (error) {
            throw new Error(`Failed to cancel Stellar escrow: ${error.message}`);
        }
    }
    async getBalance(address, tokenAddress) {
        try {
            const account = await this.server.loadAccount(address);
            const tokenCode = this.getTokenCode(tokenAddress);
            if (tokenCode === 'XLM') {
                // Native XLM balance
                const balance = account.balances.find(b => b.asset_type === 'native');
                return balance ? BigInt(Math.floor(parseFloat(balance.balance) * 1e7)) : 0n;
            }
            else {
                // Custom asset balance
                const balance = account.balances.find(b => b.asset_type !== 'native' &&
                    b.asset_code === tokenCode);
                return balance ? BigInt(Math.floor(parseFloat(balance.balance) * 1e7)) : 0n;
            }
        }
        catch (error) {
            throw new Error(`Failed to get Stellar balance: ${error.message}`);
        }
    }
    async getBlockTimestamp() {
        try {
            const ledger = await this.server.ledgers().order('desc').limit(1).call();
            const latestLedger = ledger.records[0];
            return BigInt(new Date(latestLedger.closed_at).getTime() / 1000);
        }
        catch (error) {
            throw new Error(`Failed to get Stellar block timestamp: ${error.message}`);
        }
    }
    isChainSupported() {
        return true;
    }
    getTokenCode(tokenAddress) {
        // For Stellar, we need to map addresses to asset codes
        // This is a simplified implementation
        if (tokenAddress === 'native' || tokenAddress === 'XLM') {
            return 'XLM';
        }
        // For other tokens, extract from address or use mapping
        return tokenAddress.slice(0, 12); // Stellar asset codes are max 12 chars
    }
    createHashlockCondition(secretHash) {
        // Create a condition that can be satisfied by revealing the secret
        // This is a simplified implementation - in practice would use Stellar conditions
        return {
            type: 'sha256',
            hash: secretHash
        };
    }
}
exports.StellarAdapter = StellarAdapter;
