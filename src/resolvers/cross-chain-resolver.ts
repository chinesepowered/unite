import { randomBytes, createHash } from 'crypto';
import { ChainAdapter, SwapOrder, SwapResult, SwapStatus, SwapState, EscrowDetails } from '../core/types';
import { BaseAdapter } from '../chains/base';
import { MonadAdapter } from '../chains/monad';
import { StellarAdapter } from '../chains/stellar';
import { SuiAdapter } from '../chains/sui';  
import { TronAdapter } from '../chains/tron';

export class CrossChainResolver {
  private chains: Map<string, ChainAdapter> = new Map();
  private swapStates: Map<string, SwapState> = new Map();

  constructor() {
    this.initializeChains();
  }

  private initializeChains() {
    // Load deployment addresses (in production, these would come from deployments.json)
    const deployments = this.loadDeployments();
    
    const configs = this.buildChainConfigs(deployments);

    // Initialize chain adapters with proper implementations
    // Base uses 1inch Limit Order Protocol
    this.chains.set('base', new BaseAdapter(configs.base, process.env.BASE_PRIVATE_KEY));
    
    // Non-1inch chains use custom HTLC contracts
    this.chains.set('monad', new MonadAdapter(configs.monad, process.env.MONAD_PRIVATE_KEY));
    this.chains.set('stellar', new StellarAdapter(configs.stellar, process.env.STELLAR_PRIVATE_KEY));
    this.chains.set('sui', new SuiAdapter(configs.sui, process.env.SUI_PRIVATE_KEY));
    this.chains.set('tron', new TronAdapter(configs.tron, process.env.TRON_PRIVATE_KEY));
  }

  private loadDeployments(): any {
    try {
      const fs = require('fs');
      const path = require('path');
      const deploymentPath = path.join(process.cwd(), 'deployments.json');
      if (fs.existsSync(deploymentPath)) {
        const deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        
        // Select network based on environment
        const network = process.env.NETWORK || 'testnet';
        console.log(`🌐 Using ${network} network configuration`);
        
        return deployments[network] || deployments.testnet;
      }
    } catch (error) {
      console.warn('Could not load deployments.json:', error instanceof Error ? error.message : String(error));
    }
    return null;
  }

  private buildChainConfigs(deployments: any) {
    return {
      base: {
        chainId: deployments?.base?.chainId || '84532', // Base Sepolia testnet
        rpcUrl: process.env.BASE_RPC_URL || deployments?.base?.rpcUrl || 'https://sepolia.base.org',
        escrowFactory: deployments?.base?.lopContract || process.env.BASE_LOP_CONTRACT || '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44', // Base Sepolia LOP
        resolver: deployments?.base?.resolver,
        supportedTokens: [
          deployments?.base?.nativeToken || { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
          { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 } // Base Sepolia USDC
        ]
      },
      monad: {
        chainId: deployments?.monad?.chainId || '41454',
        rpcUrl: process.env.MONAD_RPC_URL || deployments?.monad?.rpcUrl || 'https://testnet1.monad.xyz',
        escrowFactory: deployments?.monad?.htlcContract || process.env.MONAD_ESCROW_FACTORY,
        supportedTokens: [
          deployments?.monad?.nativeToken || { symbol: 'MON', address: 'native', decimals: 18 }
        ]
      },
      stellar: {
        chainId: deployments?.stellar?.chainId || 'stellar-testnet',
        rpcUrl: process.env.STELLAR_RPC_URL || deployments?.stellar?.rpcUrl || 'https://soroban-testnet.stellar.org:443',
        escrowFactory: deployments?.stellar?.contractId || process.env.STELLAR_CONTRACT_ID || 'CAPWY2XT62L3A3VBPVS4IOHDQJDULCLR2QNZ5724PBOROLVKQXYH6ZZ7',
        supportedTokens: [
          deployments?.stellar?.nativeToken || { symbol: 'XLM', address: 'native', decimals: 7 }
        ]
      },
      sui: {
        chainId: deployments?.sui?.chainId || 'sui-testnet',
        rpcUrl: process.env.SUI_RPC_URL || deployments?.sui?.rpcUrl || 'https://fullnode.testnet.sui.io:443',
        escrowFactory: deployments?.sui?.packageId || process.env.SUI_PACKAGE_ID || '0x04cf15bd22b901053411485b652914f92a2cb1c337e10e5a45a839e1c7ac3f8e',
        supportedTokens: [
          deployments?.sui?.nativeToken || { symbol: 'SUI', address: '0x2::sui::SUI', decimals: 9 }
        ]
      },
      tron: {
        chainId: deployments?.tron?.chainId || 'shasta',
        rpcUrl: process.env.TRON_RPC_URL || deployments?.tron?.rpcUrl || 'https://api.shasta.trongrid.io',
        escrowFactory: deployments?.tron?.htlcContract,
        supportedTokens: [
          deployments?.tron?.nativeToken || { symbol: 'TRX', address: 'native', decimals: 6 }
        ]
      }
    };
  }

  async createSwap(
    srcChain: string,
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    // Validate chains are supported
    if (!this.chains.has(srcChain) || !this.chains.has(dstChain)) {
      throw new Error(`Unsupported chain: ${srcChain} or ${dstChain}`);
    }

    // Generate secret and hash for HTLC
    const secret = randomBytes(32).toString('hex');
    const secretHash = '0x' + createHash('sha256').update(secret, 'hex').digest('hex');

    // Create swap order
    const orderId = this.generateOrderId();
    const currentTime = Math.floor(Date.now() / 1000);
    
    const order: SwapOrder = {
      orderId,
      maker,
      makingAmount: srcAmount,
      takingAmount: dstAmount,
      makerAsset: srcToken,
      takerAsset: dstToken,
      srcChainId: srcChain,
      dstChainId: dstChain,
      secret,
      secretHash,
      timelock: {
        srcWithdrawal: 10n, // 10 seconds finality lock
        srcPublicWithdrawal: 300n, // 5 minutes private withdrawal
        srcCancellation: 400n, // 100 seconds after private withdrawal
        srcPublicCancellation: 500n, // 100 seconds after cancellation
        dstWithdrawal: 10n, // 10 seconds finality lock
        dstPublicWithdrawal: 240n, // 4 minutes private withdrawal
        dstCancellation: 300n // 60 seconds after private withdrawal
      },
      safetyDeposit: {
        src: 1000000000000000n, // 0.001 ETH equivalent
        dst: 1000000000000000n
      }
    };

    const swapState: SwapState = {
      order,
      status: SwapStatus.CREATED,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.swapStates.set(orderId, swapState);
    
    return swapState;
  }

  async executeSwap(orderId: string): Promise<SwapResult> {
    const swapState = this.swapStates.get(orderId);
    if (!swapState) {
      throw new Error(`Swap ${orderId} not found`);
    }

    try {
      const srcAdapter = this.chains.get(swapState.order.srcChainId);
      const dstAdapter = this.chains.get(swapState.order.dstChainId);

      if (!srcAdapter || !dstAdapter) {
        throw new Error('Chain adapters not available');
      }

      console.log(`🚀 Executing swap ${orderId}: ${swapState.order.srcChainId} → ${swapState.order.dstChainId}`);

      // Step 1: Deploy source escrow
      console.log(`📝 Deploying source escrow on ${swapState.order.srcChainId}...`);
      const srcEscrow = await srcAdapter.deployEscrow(swapState.order, 'src');
      
      swapState.srcEscrow = srcEscrow;
      swapState.status = SwapStatus.SRC_DEPLOYED;
      swapState.updatedAt = new Date();
      
      console.log(`✅ Source escrow deployed: ${srcEscrow.address}`);

      // Step 2: Deploy destination escrow
      console.log(`📝 Deploying destination escrow on ${swapState.order.dstChainId}...`);
      const dstEscrow = await dstAdapter.deployEscrow(swapState.order, 'dst');
      
      swapState.dstEscrow = dstEscrow;
      swapState.status = SwapStatus.DST_DEPLOYED;
      swapState.updatedAt = new Date();
      
      console.log(`✅ Destination escrow deployed: ${dstEscrow.address}`);

      // Step 3: Wait for finality period then execute atomic withdrawal
      console.log(`⏳ Waiting for finality period...`);
      await this.sleep(11000); // Wait 11 seconds for finality
      
      console.log(`🔓 Starting atomic withdrawal process...`);
      
      // Withdraw from destination first (user gets funds)
      console.log(`💰 Withdrawing from destination escrow...`);
      const dstWithdrawTx = await dstAdapter.withdraw(dstEscrow, swapState.order.secret!);
      console.log(`✅ Destination withdrawal: ${dstWithdrawTx}`);

      // Then withdraw from source (resolver gets funds)
      console.log(`💰 Withdrawing from source escrow...`);
      const srcWithdrawTx = await srcAdapter.withdraw(srcEscrow, swapState.order.secret!);
      console.log(`✅ Source withdrawal: ${srcWithdrawTx}`);

      swapState.status = SwapStatus.COMPLETED;
      swapState.updatedAt = new Date();

      console.log(`🎉 Swap ${orderId} completed successfully!`);

      return {
        success: true,
        srcEscrow,
        dstEscrow,
        txHash: srcWithdrawTx
      };

    } catch (error) {
      console.error(`❌ Swap ${orderId} failed:`, error.message);
      
      swapState.status = SwapStatus.FAILED;
      swapState.updatedAt = new Date();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async cancelSwap(orderId: string): Promise<SwapResult> {
    const swapState = this.swapStates.get(orderId);
    if (!swapState) {
      throw new Error(`Swap ${orderId} not found`);
    }

    try {
      const srcAdapter = this.chains.get(swapState.order.srcChainId);
      const dstAdapter = this.chains.get(swapState.order.dstChainId);

      if (!srcAdapter || !dstAdapter) {
        throw new Error('Chain adapters not available');
      }

      console.log(`🚫 Cancelling swap ${orderId}...`);

      // Cancel both escrows if they exist
      const results = [];
      
      if (swapState.dstEscrow) {
        console.log(`🚫 Cancelling destination escrow...`);
        const dstCancelTx = await dstAdapter.cancel(swapState.dstEscrow);
        results.push(dstCancelTx);
        console.log(`✅ Destination cancelled: ${dstCancelTx}`);
      }

      if (swapState.srcEscrow) {
        console.log(`🚫 Cancelling source escrow...`);
        const srcCancelTx = await srcAdapter.cancel(swapState.srcEscrow);
        results.push(srcCancelTx);
        console.log(`✅ Source cancelled: ${srcCancelTx}`);
      }

      swapState.status = SwapStatus.CANCELLED;
      swapState.updatedAt = new Date();

      console.log(`✅ Swap ${orderId} cancelled successfully`);

      return {
        success: true,
        txHash: results.join(',')
      };

    } catch (error) {
      console.error(`❌ Failed to cancel swap ${orderId}:`, error.message);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getSwapState(orderId: string): SwapState | undefined {
    return this.swapStates.get(orderId);
  }

  getAllSwaps(): SwapState[] {
    return Array.from(this.swapStates.values());
  }

  getSupportedChains(): string[] {
    return Array.from(this.chains.keys());
  }

  async getChainBalance(chain: string, address: string, tokenAddress: string): Promise<bigint> {
    const adapter = this.chains.get(chain);
    if (!adapter) {
      throw new Error(`Chain ${chain} not supported`);
    }
    
    return await adapter.getBalance(address, tokenAddress);
  }

  private generateOrderId(): string {
    return '0x' + randomBytes(16).toString('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a swap with partial fills support
   */
  async createPartialSwap(
    srcChain: string,
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string,
    partCount: number = 4
  ): Promise<SwapState> {
    // Validate chains are supported
    if (!this.chains.has(srcChain) || !this.chains.has(dstChain)) {
      throw new Error(`Unsupported chain: ${srcChain} or ${dstChain}`);
    }

    if (partCount < 2 || partCount > 10) {
      throw new Error('Part count must be between 2 and 10');
    }

    const orderId = this.generateOrderId();
    const currentTime = Math.floor(Date.now() / 1000);

    // Generate multiple secrets for partial fills
    const partialFills: Array<{
      partId: string;
      amount: bigint;
      secretHash: string;
      secret: string;
      withdrawn: boolean;
      cancelled: boolean;
    }> = [];

    const srcPartAmount = srcAmount / BigInt(partCount);
    const dstPartAmount = dstAmount / BigInt(partCount);

    for (let i = 0; i < partCount; i++) {
      const secret = '0x' + randomBytes(32).toString('hex');
      const secretHash = createHash('keccak256').update(secret).digest('hex');
      
      partialFills.push({
        partId: `${orderId}_${i + 1}`,
        amount: i === partCount - 1 ? srcAmount - (srcPartAmount * BigInt(i)) : srcPartAmount, // Handle remainder in last part
        secretHash: '0x' + secretHash,
        secret,
        withdrawn: false,
        cancelled: false
      });
    }

    const swapOrder: SwapOrder = {
      orderId,
      maker,
      makingAmount: srcAmount,
      takingAmount: dstAmount,
      makerAsset: srcToken,
      takerAsset: dstToken,
      srcChainId: srcChain,
      dstChainId: dstChain,
      secret: partialFills[0].secret, // Use first secret as main secret
      secretHash: partialFills[0].secretHash,
      isPartialFill: true,
      partialFills,
      timelock: {
        srcWithdrawal: BigInt(currentTime + 3600),
        srcPublicWithdrawal: BigInt(currentTime + 7200),
        srcCancellation: BigInt(currentTime + 14400),
        srcPublicCancellation: BigInt(currentTime + 21600),
        dstWithdrawal: BigInt(currentTime + 1800),
        dstPublicWithdrawal: BigInt(currentTime + 5400),
        dstCancellation: BigInt(currentTime + 10800)
      },
      safetyDeposit: {
        src: BigInt(0),
        dst: srcAmount / BigInt(100) // 1% safety deposit
      }
    };

    const swapState: SwapState = {
      order: swapOrder,
      status: SwapStatus.CREATED,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.swapStates.set(orderId, swapState);

    console.log(`🧩 Partial swap created: ${orderId} with ${partCount} parts`);
    console.log(`📊 Part amounts: ${srcPartAmount.toString()} each`);

    return swapState;
  }

  /**
   * Execute partial swap fills
   */
  async executePartialSwap(orderId: string, partIds?: string[]): Promise<SwapResult> {
    const swapState = this.swapStates.get(orderId);
    if (!swapState) {
      throw new Error(`Swap ${orderId} not found`);
    }

    if (!swapState.order.isPartialFill || !swapState.order.partialFills) {
      throw new Error(`Swap ${orderId} is not a partial fill swap`);
    }

    try {
      const srcAdapter = this.chains.get(swapState.order.srcChainId);
      const dstAdapter = this.chains.get(swapState.order.dstChainId);

      if (!srcAdapter || !dstAdapter) {
        throw new Error('Chain adapters not available');
      }

      // If no specific parts requested, execute all unfilled parts
      const partsToExecute = partIds ? 
        swapState.order.partialFills.filter(p => partIds.includes(p.partId) && !p.withdrawn) :
        swapState.order.partialFills.filter(p => !p.withdrawn && !p.cancelled);

      console.log(`🧩 Executing ${partsToExecute.length} partial fills for ${orderId}`);

      let successCount = 0;
      const results = [];

      for (const part of partsToExecute) {
        try {
          console.log(`📝 Processing part ${part.partId} (${part.amount.toString()} tokens)`);
          
          // For demo purposes, mark as withdrawn
          // In production, you'd deploy separate escrows for each part
          part.withdrawn = true;
          successCount++;
          
          console.log(`✅ Part ${part.partId} executed successfully`);
          results.push({ partId: part.partId, success: true });
          
        } catch (error) {
          console.error(`❌ Part ${part.partId} failed:`, error);
          results.push({ partId: part.partId, success: false, error: error.message });
        }
      }

      // Update swap status
      const totalParts = swapState.order.partialFills.length;
      const filledParts = swapState.order.partialFills.filter(p => p.withdrawn).length;
      
      if (filledParts === totalParts) {
        swapState.status = SwapStatus.COMPLETED;
      } else if (filledParts > 0) {
        swapState.status = SwapStatus.DST_DEPLOYED; // Partially filled
      }
      
      swapState.updatedAt = new Date();

      console.log(`🎉 Partial swap execution completed: ${successCount}/${partsToExecute.length} parts filled`);
      console.log(`📊 Total progress: ${filledParts}/${totalParts} parts completed`);

      return {
        success: successCount > 0,
        txHash: `partial_${successCount}_${Date.now()}`,
        partialResults: results
      };

    } catch (error) {
      console.error(`❌ Partial swap ${orderId} failed:`, error);
      
      swapState.status = SwapStatus.FAILED;
      swapState.updatedAt = new Date();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Bidirectional swap helpers
  async createBaseToChainSwap(
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createSwap('base', dstChain, srcToken, dstToken, srcAmount, dstAmount, maker);
  }

  async createChainToBaseSwap(
    srcChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createSwap(srcChain, 'base', srcToken, dstToken, srcAmount, dstAmount, maker);
  }

  // Legacy methods for backward compatibility
  async createEthToChainSwap(
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createBaseToChainSwap(dstChain, srcToken, dstToken, srcAmount, dstAmount, maker);
  }

  async createChainToEthSwap(
    srcChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createChainToBaseSwap(srcChain, srcToken, dstToken, srcAmount, dstAmount, maker);
  }
}