import { ethers } from 'ethers';
import Sdk from '@1inch/cross-chain-sdk';
import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';

// Simplified HTLC ABI for testnet fallback
const HTLC_ABI = [
  'function createHTLCEscrowNative(bytes32 secretHash, uint256 timelock, address payable receiver, string memory orderId) payable returns (bytes32)',
  'function createHTLCEscrowERC20(address tokenAddress, uint256 amount, bytes32 secretHash, uint256 timelock, address payable receiver, string memory orderId) returns (bytes32)',
  'function withdraw(bytes32 escrowId, string memory secret)',
  'function cancel(bytes32 escrowId)',
  'function getEscrowByOrderId(string memory orderId) view returns (bytes32, address, address, uint256, bytes32, uint256, bool, bool, address, uint256)',
  'function verifySecret(bytes32 escrowId, string memory secret) view returns (bool)',
  'function canCancel(bytes32 escrowId) view returns (bool)',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed sender, address indexed receiver, uint256 amount, bytes32 secretHash, uint256 timelock, address tokenAddress, string orderId)'
];

/**
 * Dual-mode Ethereum adapter:
 * - Mainnet: Uses 1inch infrastructure (production-ready)
 * - Testnet: Uses simplified HTLC contract (demo/testing)
 */
export class EthereumAdapter extends ChainAdapter {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private htlcContract?: ethers.Contract;
  private isMainnet: boolean;
  private useOneInch: boolean;

  constructor(config: ChainConfig, privateKey?: string) {
    super(config);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Determine if this is mainnet based on chain ID
    this.isMainnet = config.chainId === '1';
    
    // Use 1inch for mainnet, simplified HTLC for testnet
    this.useOneInch = this.isMainnet && !process.env.FORCE_SIMPLE_HTLC;
    
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    // Set up contracts based on mode
    if (!this.useOneInch && config.escrowFactory) {
      this.htlcContract = new ethers.Contract(
        config.escrowFactory,
        HTLC_ABI,
        this.wallet || this.provider
      );
    }

    console.log(`🔗 Ethereum adapter initialized: ${this.useOneInch ? '1inch (mainnet)' : 'Simple HTLC (testnet)'}`);
  }

  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    if (this.useOneInch) {
      return this.deployOneInchEscrow(order, side);
    } else {
      return this.deploySimpleHTLCEscrow(order, side);
    }
  }

  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
    if (this.useOneInch) {
      return this.withdrawOneInch(escrow, secret);
    } else {
      return this.withdrawSimpleHTLC(escrow, secret);
    }
  }

  async cancel(escrow: EscrowDetails): Promise<string> {
    if (this.useOneInch) {
      return this.cancelOneInch(escrow);
    } else {
      return this.cancelSimpleHTLC(escrow);
    }
  }

  // === 1INCH MAINNET IMPLEMENTATION ===

  private async deployOneInchEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    if (!this.wallet) {
      throw new Error('Wallet not configured for Ethereum adapter');
    }

    if (!this.config.escrowFactory) {
      throw new Error('EscrowFactory not configured for Ethereum chain');
    }

    try {
      if (side === 'src') {
        // Deploy source escrow using 1inch SDK patterns
        const escrowFactoryAddress = new Sdk.Address(this.config.escrowFactory);
        const factory = new Sdk.ESCROW_FACTORY(escrowFactoryAddress);
        
        // Create immutables for source escrow
        const immutables = {
          orderHash: ethers.keccak256(ethers.toUtf8Bytes(order.orderId)),
          hashLock: order.secretHash,
          maker: new Sdk.Address(order.maker),
          receiver: new Sdk.Address(order.maker), // User receives on destination
          srcToken: new Sdk.Address(order.makerAsset),
          dstToken: new Sdk.Address(order.takerAsset),
          srcAmount: order.makingAmount,
          dstAmount: order.takingAmount,
          srcChainId: BigInt(order.srcChainId),
          dstChainId: BigInt(order.dstChainId),
          safetyDeposit: order.safetyDeposit.src,
          timelocks: {
            srcWithdrawal: order.timelock.srcWithdrawal,
            srcPublicWithdrawal: order.timelock.srcPublicWithdrawal,
            srcCancellation: order.timelock.srcCancellation,
            srcPublicCancellation: order.timelock.srcPublicCancellation,
            dstWithdrawal: order.timelock.dstWithdrawal,
            dstPublicWithdrawal: order.timelock.dstPublicWithdrawal,
            dstCancellation: order.timelock.dstCancellation
          }
        };

        // Deploy source escrow
        const escrowAddress = factory.getSrcEscrowAddress(
          immutables,
          await this.getEscrowImplementation('src')
        );

        return {
          address: escrowAddress.toString(),
          immutables,
          deployedAt: await this.getBlockTimestamp()
        };
      } else {
        // Deploy destination escrow
        const immutables = {
          orderHash: ethers.keccak256(ethers.toUtf8Bytes(order.orderId)),
          hashLock: order.secretHash,
          taker: new Sdk.Address(this.wallet.address), // Resolver takes on destination
          receiver: new Sdk.Address(order.maker), // User receives
          srcToken: new Sdk.Address(order.makerAsset),
          dstToken: new Sdk.Address(order.takerAsset),
          srcAmount: order.makingAmount,
          dstAmount: order.takingAmount,
          srcChainId: BigInt(order.srcChainId),
          dstChainId: BigInt(order.dstChainId),
          safetyDeposit: order.safetyDeposit.dst,
          deployedAt: await this.getBlockTimestamp()
        };

        const escrowFactory = new ethers.Contract(
          this.config.escrowFactory,
          ['function createDstEscrow(tuple immutables, uint256 srcCancellationTimestamp) payable'],
          this.wallet
        );

        const tx = await escrowFactory.createDstEscrow(
          immutables,
          order.timelock.srcCancellation,
          { value: order.safetyDeposit.dst }
        );

        await tx.wait();
        
        // Calculate destination escrow address
        const factory = new Sdk.ESCROW_FACTORY(new Sdk.Address(this.config.escrowFactory));
        const dstEscrowAddress = factory.getDstEscrowAddress(
          immutables,
          immutables,
          immutables.deployedAt,
          new Sdk.Address(this.wallet.address),
          await this.getEscrowImplementation('dst')
        );

        return {
          address: dstEscrowAddress.toString(),
          immutables,
          deployedAt: immutables.deployedAt
        };
      }
    } catch (error) {
      throw new Error(`Failed to deploy ${side} escrow (1inch): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async withdrawOneInch(escrow: EscrowDetails, secret: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    try {
      const escrowContract = new ethers.Contract(
        escrow.address,
        ['function withdraw(bytes32 secret, tuple immutables)'],
        this.wallet
      );

      const tx = await escrowContract.withdraw(secret, escrow.immutables);
      const receipt = await tx.wait();
      
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to withdraw from escrow (1inch): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cancelOneInch(escrow: EscrowDetails): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    try {
      const escrowContract = new ethers.Contract(
        escrow.address,
        ['function cancel(tuple immutables)'],
        this.wallet
      );

      const tx = await escrowContract.cancel(escrow.immutables);
      const receipt = await tx.wait();
      
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to cancel escrow (1inch): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // === SIMPLE HTLC TESTNET IMPLEMENTATION ===

  private async deploySimpleHTLCEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    if (!this.wallet || !this.htlcContract) {
      throw new Error('Wallet or HTLC contract not configured');
    }

    try {
      const amount = side === 'src' ? order.makingAmount : order.takingAmount;
      const tokenAddress = side === 'src' ? order.makerAsset : order.takerAsset;
      const currentTime = Math.floor(Date.now() / 1000);
      const timelock = currentTime + Number(side === 'src' ? order.timelock.srcCancellation : order.timelock.dstCancellation);

      let tx;
      let escrowId: string;

      if (this.isNativeToken(tokenAddress)) {
        // Deploy native ETH escrow
        tx = await this.htlcContract.createHTLCEscrowNative(
          order.secretHash,
          timelock,
          order.maker, // User receives the funds
          order.orderId,
          { value: amount }
        );
      } else {
        // Deploy ERC20 token escrow
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          this.wallet
        );
        
        const approveTx = await tokenContract.approve(await this.htlcContract.getAddress(), amount);
        await approveTx.wait();

        tx = await this.htlcContract.createHTLCEscrowERC20(
          tokenAddress,
          amount,
          order.secretHash,
          timelock,
          order.maker, // User receives the funds
          order.orderId
        );
      }

      const receipt = await tx.wait();
      
      // Extract escrow ID from logs
      const log = receipt.logs.find((log: any) => {
        try {
          const parsed = this.htlcContract!.interface.parseLog(log);
          return parsed?.name === 'EscrowCreated';
        } catch {
          return false;
        }
      });

      if (log) {
        const parsed = this.htlcContract.interface.parseLog(log);
        escrowId = parsed!.args.escrowId;
      } else {
        throw new Error('Could not find EscrowCreated event');
      }

      const immutables = {
        escrowId,
        orderHash: order.orderId,
        secretHash: order.secretHash,
        maker: order.maker,
        receiver: order.maker,
        srcToken: order.makerAsset,
        dstToken: order.takerAsset,
        srcAmount: order.makingAmount,
        dstAmount: order.takingAmount,
        timelock: timelock,
        contractAddress: await this.htlcContract.getAddress(),
        txHash: receipt.hash
      };

      return {
        address: await this.htlcContract.getAddress(),
        immutables,
        deployedAt: BigInt(currentTime)
      };

    } catch (error) {
      throw new Error(`Failed to deploy ${side} escrow (simple HTLC): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async withdrawSimpleHTLC(escrow: EscrowDetails, secret: string): Promise<string> {
    if (!this.wallet || !this.htlcContract) {
      throw new Error('Wallet or HTLC contract not configured');
    }

    try {
      const tx = await this.htlcContract.withdraw(escrow.immutables.escrowId, secret);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to withdraw (simple HTLC): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cancelSimpleHTLC(escrow: EscrowDetails): Promise<string> {
    if (!this.wallet || !this.htlcContract) {
      throw new Error('Wallet or HTLC contract not configured');
    }

    try {
      const tx = await this.htlcContract.cancel(escrow.immutables.escrowId);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to cancel (simple HTLC): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // === SHARED UTILITIES ===

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

  private async getEscrowImplementation(side: 'src' | 'dst'): Promise<string> {
    if (!this.config.escrowFactory) {
      throw new Error('EscrowFactory not configured');
    }

    const factory = new ethers.Contract(
      this.config.escrowFactory,
      [
        'function srcEscrowImplementation() view returns (address)',
        'function dstEscrowImplementation() view returns (address)'
      ],
      this.provider
    );

    if (side === 'src') {
      return await factory.srcEscrowImplementation();
    } else {
      return await factory.dstEscrowImplementation();
    }
  }

  // Public method to check which mode is being used
  getMode(): string {
    return this.useOneInch ? '1inch-mainnet' : 'simple-htlc-testnet';
  }
}