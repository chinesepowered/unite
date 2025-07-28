import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/bcs';
import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
import { createHash } from 'crypto';

export class SuiAdapter extends ChainAdapter {
  private client: SuiClient;
  private keypair?: Ed25519Keypair;

  constructor(config: ChainConfig, privateKey?: string) {
    super(config);
    this.client = new SuiClient({ url: config.rpcUrl });
    
    if (privateKey) {
      // Convert hex private key to Uint8Array for Sui
      const keyBytes = privateKey.startsWith('0x') 
        ? fromB64(Buffer.from(privateKey.slice(2), 'hex').toString('base64'))
        : fromB64(privateKey);
      this.keypair = Ed25519Keypair.fromSecretKey(keyBytes);
    }
  }

  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    if (!this.keypair) {
      throw new Error('Keypair not configured for Sui adapter');
    }

    try {
      const txb = new TransactionBlock();
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
      } else {
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

    } catch (error) {
      throw new Error(`Failed to deploy Sui escrow: ${error.message}`);
    }
  }

  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
    if (!this.keypair) {
      throw new Error('Keypair not configured');
    }

    try {
      // Verify secret hash
      const secretHash = createHash('sha256').update(secret).digest('hex');
      if (secretHash !== escrow.immutables.secretHash.slice(2)) {
        throw new Error('Invalid secret provided');
      }

      const txb = new TransactionBlock();
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

    } catch (error) {
      throw new Error(`Failed to withdraw from Sui escrow: ${error.message}`);
    }
  }

  async cancel(escrow: EscrowDetails): Promise<string> {
    if (!this.keypair) {
      throw new Error('Keypair not configured');
    }

    try {
      // Check if timelock has expired
      const currentTime = Date.now();
      if (currentTime < escrow.immutables.timelock) {
        throw new Error('Cannot cancel escrow before timelock expiry');
      }

      const txb = new TransactionBlock();
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

    } catch (error) {
      throw new Error(`Failed to cancel Sui escrow: ${error.message}`);
    }
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    try {
      if (tokenAddress === '0x2::sui::SUI' || !tokenAddress.includes('::')) {
        // Get SUI balance
        const balance = await this.client.getBalance({
          owner: address,
          coinType: '0x2::sui::SUI'
        });
        return BigInt(balance.totalBalance);
      } else {
        // Get custom token balance
        const balance = await this.client.getBalance({
          owner: address,
          coinType: tokenAddress
        });
        return BigInt(balance.totalBalance);
      }
    } catch (error) {
      throw new Error(`Failed to get Sui balance: ${error.message}`);
    }
  }

  async getBlockTimestamp(): Promise<bigint> {
    try {
      // Get latest checkpoint
      const checkpoint = await this.client.getLatestCheckpointSequenceNumber();
      const checkpointData = await this.client.getCheckpoint({
        id: checkpoint
      });
      
      return BigInt(Math.floor(parseInt(checkpointData.timestampMs) / 1000));
    } catch (error) {
      throw new Error(`Failed to get Sui block timestamp: ${error.message}`);
    }
  }

  isChainSupported(): boolean {
    return true;
  }

  private extractEscrowObjectId(result: SuiTransactionBlockResponse): string {
    // Extract the created escrow object ID from transaction effects
    const createdObjects = result.objectChanges?.filter(
      change => change.type === 'created'
    );
    
    if (!createdObjects || createdObjects.length === 0) {
      throw new Error('No escrow object created in transaction');
    }

    // Return the first created object (assumes it's the escrow)
    const escrowObject = createdObjects.find(obj => 
      (obj as any).objectType?.includes('escrow') || 
      (obj as any).objectType?.includes('Escrow')
    );

    if (!escrowObject) {
      // Fallback to first created object
      return (createdObjects[0] as any).objectId;
    }

    return (escrowObject as any).objectId;
  }
}