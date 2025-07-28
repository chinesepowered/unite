import { randomBytes, createHash } from 'crypto';
import { ChainAdapter, SwapOrder, SwapResult, SwapStatus, SwapState, EscrowDetails } from '../core/types';
import { EthereumAdapter } from '../chains/ethereum';
import { MonadAdapter } from '../chains/monad';
import { StellarAdapter } from '../chains/stellar';
import { SuiAdapter } from '../chains/sui';  
import { TronAdapter } from '../chains/tron';

export class WorkingCrossChainResolver {
  private chains: Map<string, ChainAdapter> = new Map();
  private swapStates: Map<string, SwapState> = new Map();

  constructor() {
    this.initializeChains();
  }

  private initializeChains() {
    // Load deployment addresses (in production, these would come from deployments.json)
    const deployments = this.loadDeployments();
    
    const configs = {
      ethereum: {
        chainId: '1',
        rpcUrl: process.env.ETH_RPC_URL || 'https://eth.merkle.io',
        escrowFactory: deployments?.htlc?.ethereum || process.env.ETH_ESCROW_FACTORY,
        resolver: process.env.ETH_RESOLVER,
        supportedTokens: [
          { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
          { symbol: 'USDC', address: '0xA0b86a33E6441c8C47ed7E37d59D3d4a16D35f73', decimals: 6 }
        ]
      },
      monad: {
        chainId: '34443',
        rpcUrl: process.env.MONAD_RPC_URL || 'https://monad-rpc.com',
        escrowFactory: deployments?.htlc?.monad || process.env.MONAD_ESCROW_FACTORY,
        supportedTokens: [
          { symbol: 'MON', address: 'native', decimals: 18 }
        ]
      },
      stellar: {
        chainId: 'stellar',
        rpcUrl: process.env.STELLAR_RPC_URL || 'https://horizon-testnet.stellar.org',
        escrowFactory: deployments?.htlc?.stellar,
        supportedTokens: [
          { symbol: 'XLM', address: 'native', decimals: 7 }
        ]
      },
      sui: {
        chainId: 'sui',
        rpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
        escrowFactory: deployments?.htlc?.sui,
        supportedTokens: [
          { symbol: 'SUI', address: '0x2::sui::SUI', decimals: 9 }
        ]
      },
      tron: {
        chainId: 'tron',
        rpcUrl: process.env.TRON_RPC_URL || 'https://api.trongrid.io',
        escrowFactory: deployments?.htlc?.tron,
        supportedTokens: [
          { symbol: 'TRX', address: 'native', decimals: 6 }
        ]
      }
    };

    // Initialize chain adapters with proper HTLC implementations
    // Ethereum uses 1inch escrow factory
    this.chains.set('ethereum', new EthereumAdapter(configs.ethereum, process.env.ETH_PRIVATE_KEY));
    
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
        return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load deployments.json:', error.message);
    }
    return null;
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

  // Bidirectional swap helpers
  async createEthToChainSwap(
    dstChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createSwap('ethereum', dstChain, srcToken, dstToken, srcAmount, dstAmount, maker);
  }

  async createChainToEthSwap(
    srcChain: string,
    srcToken: string,
    dstToken: string,
    srcAmount: bigint,
    dstAmount: bigint,
    maker: string
  ): Promise<SwapState> {
    return this.createSwap(srcChain, 'ethereum', srcToken, dstToken, srcAmount, dstAmount, maker);
  }
}