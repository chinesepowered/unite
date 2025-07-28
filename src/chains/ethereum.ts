import { ethers, JsonRpcProvider, Wallet } from 'ethers';
import Sdk from '@1inch/cross-chain-sdk';
import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';

export class EthereumAdapter extends ChainAdapter {
  private provider: JsonRpcProvider;
  private wallet?: Wallet;

  constructor(config: ChainConfig, privateKey?: string) {
    super(config);
    this.provider = new JsonRpcProvider(config.rpcUrl, parseInt(config.chainId));
    
    if (privateKey) {
      this.wallet = new Wallet(privateKey, this.provider);
    }
  }

  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
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
      throw new Error(`Failed to deploy ${side} escrow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
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
      throw new Error(`Failed to withdraw from escrow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cancel(escrow: EscrowDetails): Promise<string> {
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
      throw new Error(`Failed to cancel escrow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    if (tokenAddress === ethers.ZeroAddress) {
      // Native ETH balance
      return await this.provider.getBalance(address);
    } else {
      // ERC20 token balance
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
    return true; // Ethereum is always supported via 1inch SDK
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
}