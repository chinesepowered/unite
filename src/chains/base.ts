import { ethers } from 'ethers';
import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';

// 1inch Limit Order Protocol ABI (minimal required functions)
const LOP_ABI = [
  // Order filling
  'function fillOrder((address,address,address,address,uint256,uint256,uint256,uint256,bytes) order, bytes32 r, bytes32 vs, uint256 amount, uint256 takerTraits) external payable returns(uint256, uint256, bytes32)',
  'function fillContractOrder((address,address,address,address,uint256,uint256,uint256,uint256,bytes) order, bytes calldata signature, uint256 amount, uint256 takerTraits) external returns(uint256, uint256, bytes32)',
  
  // Order validation and hashing
  'function hashOrder((address,address,address,address,uint256,uint256,uint256,uint256,bytes) order) external view returns(bytes32)',
  'function checkPredicate(bytes calldata predicate) external view returns(bool)',
  
  // Order cancellation
  'function cancelOrder(uint256 makerTraits, bytes32 orderHash) external',
  'function cancelOrders(uint256[] calldata makerTraits, bytes32[] calldata orderHashes) external',
  
  // Order state queries
  'function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns(uint256)',
  'function bitInvalidatorForOrder(address maker, uint256 slot) external view returns(uint256)',
  
  // Events
  'event OrderFilled(bytes32 indexed orderHash, uint256 remainingAmount)',
  'event OrderCancelled(bytes32 indexed orderHash)'
];

/**
 * Base L2 adapter using 1inch Limit Order Protocol
 * Supports both Base mainnet and Base Sepolia testnet
 */
export class BaseAdapter extends ChainAdapter {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private lopContract?: ethers.Contract;

  constructor(config: ChainConfig, privateKey?: string) {
    super(config);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    // Use the deployed LOP contract address
    // Base Sepolia: 0xE53136D9De56672e8D2665C98653AC7b8A60Dc44
    // Base Mainnet: TBD (will be deployed or use existing if available)
    if (config.escrowFactory) {
      this.lopContract = new ethers.Contract(
        config.escrowFactory,
        LOP_ABI,
        this.wallet || this.provider
      );
    }
  }

  async createLimitOrder(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    if (!this.wallet || !this.lopContract) {
      throw new Error('Wallet or LOP contract not configured');
    }

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const expiration = currentTime + Number(side === 'src' ? order.timelock.srcCancellation : order.timelock.dstCancellation);

      // Create 1inch limit order structure
      const limitOrder = {
        maker: order.maker,
        receiver: order.maker, // Where filled tokens go
        makerAsset: side === 'src' ? order.makerAsset : order.takerAsset,
        takerAsset: side === 'src' ? order.takerAsset : order.makerAsset,
        makingAmount: side === 'src' ? order.makingAmount : order.takingAmount,
        takingAmount: side === 'src' ? order.takingAmount : order.makingAmount,
        makerTraits: this.buildMakerTraits(expiration), // Include expiration and other traits
        takerTraits: 0n, // Default taker traits
        extension: '0x' // No extension for basic orders
      };

      // Get order hash for tracking
      const orderHash = await this.lopContract.hashOrder(limitOrder);

      // For demo purposes, we'll store the order info without actually submitting it
      // In production, this would integrate with 1inch's order book or be filled by resolvers
      const immutables = {
        escrowId: orderHash,
        orderHash: orderHash,
        secretHash: order.secretHash,
        maker: order.maker,
        receiver: order.maker,
        srcToken: order.makerAsset,
        dstToken: order.takerAsset,
        srcAmount: order.makingAmount,
        dstAmount: order.takingAmount,
        timelock: expiration,
        contractAddress: await this.lopContract.getAddress(),
        txHash: '', // Will be set when order is actually filled
        limitOrder: limitOrder // Store the full limit order for later filling
      };

      return {
        address: await this.lopContract.getAddress(),
        immutables,
        deployedAt: BigInt(currentTime)
      };

    } catch (error) {
      throw new Error(`Failed to create ${side} limit order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Legacy method for backward compatibility - now creates limit orders
  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    return this.createLimitOrder(order, side);
  }

  async fillLimitOrder(escrow: EscrowDetails, secret: string): Promise<string> {
    if (!this.wallet || !this.lopContract) {
      throw new Error('Wallet or LOP contract not configured');
    }

    try {
      const limitOrder = escrow.immutables.limitOrder;
      if (!limitOrder) {
        throw new Error('Limit order data not found in escrow');
      }

      // For now, use a simple signature approach
      // In production, this would be properly signed by the maker
      const orderHash = await this.lopContract.hashOrder(limitOrder);
      const signature = await this.wallet.signMessage(ethers.getBytes(orderHash));

      // Fill the entire order
      const tx = await this.lopContract.fillContractOrder(
        limitOrder,
        signature,
        limitOrder.makingAmount, // Fill entire amount
        0 // Default taker traits
      );

      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to fill limit order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Legacy method for backward compatibility - now fills limit orders
  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
    return this.fillLimitOrder(escrow, secret);
  }

  async cancelLimitOrder(escrow: EscrowDetails): Promise<string> {
    if (!this.wallet || !this.lopContract) {
      throw new Error('Wallet or LOP contract not configured');
    }

    try {
      const limitOrder = escrow.immutables.limitOrder;
      if (!limitOrder) {
        throw new Error('Limit order data not found in escrow');
      }

      const orderHash = await this.lopContract.hashOrder(limitOrder);
      const tx = await this.lopContract.cancelOrder(limitOrder.makerTraits, orderHash);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to cancel limit order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Legacy method for backward compatibility - now cancels limit orders
  async cancel(escrow: EscrowDetails): Promise<string> {
    return this.cancelLimitOrder(escrow);
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    if (this.isNativeToken(tokenAddress)) {
      return await this.provider.getBalance(address);
    } else {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      return await tokenContract.balanceOf(address);
    }
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await this.provider.getBlock('latest');
    return BigInt(block!.timestamp);
  }

  isChainSupported(): boolean {
    return true;
  }

  private isNativeToken(tokenAddress: string): boolean {
    return !tokenAddress || 
           tokenAddress === ethers.ZeroAddress || 
           tokenAddress === '0x0000000000000000000000000000000000000000' ||
           tokenAddress === 'native';
  }

  private buildMakerTraits(expiration: number): bigint {
    // Build maker traits with expiration timestamp
    // Bit layout for maker traits (simplified):
    // - Bits 0-39: expiration timestamp
    // - Other bits: various flags and settings
    
    let traits = BigInt(expiration) & ((1n << 40n) - 1n); // 40 bits for expiration
    
    // Add other traits as needed:
    // - Allow partial fills (bit 255)
    traits |= (1n << 255n);
    
    return traits;
  }

  async checkOrderStatus(orderHash: string, maker: string): Promise<{ remaining: bigint; cancelled: boolean }> {
    if (!this.lopContract) {
      throw new Error('LOP contract not configured');
    }

    try {
      const remaining = await this.lopContract.remainingInvalidatorForOrder(maker, orderHash);
      return {
        remaining: BigInt(remaining),
        cancelled: remaining === 0n
      };
    } catch (error) {
      throw new Error(`Failed to check order status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}