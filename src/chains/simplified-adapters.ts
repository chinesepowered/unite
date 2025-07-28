import { ethers } from 'ethers';
import { createHash } from 'crypto';
import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';

// Simplified HTLC ABI for the contracts we created
const HTLC_ABI = [
  'function createHTLCEscrowNative(bytes32 secretHash, uint256 timelock, address sender, address receiver, string memory orderId) payable returns (bytes32)',
  'function createHTLCEscrowERC20(address tokenAddress, uint256 amount, bytes32 secretHash, uint256 timelock, address sender, address receiver, string memory orderId) returns (bytes32)',
  'function withdraw(bytes32 escrowId, string memory secret)',
  'function cancel(bytes32 escrowId)',
  'function getEscrowByOrderId(string memory orderId) view returns (bytes32, address, address, uint256, bytes32, uint256, bool, bool, address, uint256)',
  'function verifySecret(bytes32 escrowId, string memory secret) view returns (bool)',
  'function canCancel(bytes32 escrowId) view returns (bool)',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed sender, address indexed receiver, uint256 amount, bytes32 secretHash, uint256 timelock, string orderId)'
];

/**
 * Working Ethereum/Monad adapter using deployed HTLC contracts
 */
export class WorkingEthereumAdapter extends ChainAdapter {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;
  private htlcContract?: ethers.Contract;

  constructor(config: ChainConfig, privateKey?: string) {
    super(config);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
    }

    if (config.escrowFactory) {
      this.htlcContract = new ethers.Contract(
        config.escrowFactory,
        HTLC_ABI,
        this.wallet || this.provider
      );
    }
  }

  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
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
        // Deploy native token escrow
        tx = await this.htlcContract.createHTLCEscrowNative(
          order.secretHash,
          timelock,
          order.maker,
          this.wallet.address, // receiver (resolver)
          order.orderId,
          { value: amount }
        );
      } else {
        // Deploy ERC20 token escrow
        // First approve the HTLC contract
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          this.wallet
        );
        
        const approveTx = await tokenContract.approve(await this.htlcContract.getAddress(), amount);
        await approveTx.wait();

        // Then create the escrow
        tx = await this.htlcContract.createHTLCEscrowERC20(
          tokenAddress,
          amount,
          order.secretHash,
          timelock,
          order.maker,
          this.wallet.address, // receiver (resolver)
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
        receiver: this.wallet.address,
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
      throw new Error(`Failed to deploy ${side} escrow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
    if (!this.wallet || !this.htlcContract) {
      throw new Error('Wallet or HTLC contract not configured');
    }

    try {
      const tx = await this.htlcContract.withdraw(escrow.immutables.escrowId, secret);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cancel(escrow: EscrowDetails): Promise<string> {
    if (!this.wallet || !this.htlcContract) {
      throw new Error('Wallet or HTLC contract not configured');
    }

    try {
      const tx = await this.htlcContract.cancel(escrow.immutables.escrowId);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      throw new Error(`Failed to cancel: ${error instanceof Error ? error.message : String(error)}`);
    }
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
}

/**
 * Demo adapter for non-EVM chains - simulates HTLC behavior
 * In production, these would call actual chain-specific HTLC contracts
 */
export class DemoChainAdapter extends ChainAdapter {
  private chainId: string;
  private mockEscrows: Map<string, any> = new Map();

  constructor(config: ChainConfig, chainId: string) {
    super(config);
    this.chainId = chainId;
  }

  async deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails> {
    // Simulate escrow deployment
    const escrowId = createHash('sha256')
      .update(order.orderId + side + Date.now().toString())
      .digest('hex');

    const currentTime = Math.floor(Date.now() / 1000);
    const timelock = currentTime + Number(side === 'src' ? order.timelock.srcCancellation : order.timelock.dstCancellation);

    const immutables = {
      escrowId,
      orderHash: order.orderId,
      secretHash: order.secretHash,
      maker: order.maker,
      receiver: 'resolver_address_' + this.chainId,
      srcToken: order.makerAsset,
      dstToken: order.takerAsset,
      srcAmount: order.makingAmount,
      dstAmount: order.takingAmount,
      timelock: timelock,
      contractAddress: `htlc_contract_${this.chainId}`,
      simulatedTxHash: `0x${escrowId.slice(0, 64)}`
    };

    // Store mock escrow
    this.mockEscrows.set(escrowId, {
      ...immutables,
      withdrawn: false,
      cancelled: false,
      createdAt: currentTime
    });

    // Simulate deployment delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      address: `htlc_contract_${this.chainId}`,
      immutables,
      deployedAt: BigInt(currentTime)
    };
  }

  async withdraw(escrow: EscrowDetails, secret: string): Promise<string> {
    const escrowId = escrow.immutables.escrowId;
    const mockEscrow = this.mockEscrows.get(escrowId);
    
    if (!mockEscrow) {
      throw new Error('Escrow not found');
    }

    // Verify secret hash
    const secretHash = createHash('sha256').update(secret).digest('hex');
    if (secretHash !== escrow.immutables.secretHash.slice(2)) {
      throw new Error('Invalid secret');
    }

    if (mockEscrow.withdrawn) {
      throw new Error('Already withdrawn');
    }

    if (mockEscrow.cancelled) {
      throw new Error('Already cancelled');
    }

    // Simulate withdrawal
    mockEscrow.withdrawn = true;
    this.mockEscrows.set(escrowId, mockEscrow);

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return `0x${createHash('sha256').update(escrowId + 'withdraw' + Date.now().toString()).digest('hex')}`;
  }

  async cancel(escrow: EscrowDetails): Promise<string> {
    const escrowId = escrow.immutables.escrowId;
    const mockEscrow = this.mockEscrows.get(escrowId);
    
    if (!mockEscrow) {
      throw new Error('Escrow not found');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < mockEscrow.timelock) {
      throw new Error('Timelock not expired');
    }

    if (mockEscrow.withdrawn) {
      throw new Error('Already withdrawn');
    }

    if (mockEscrow.cancelled) {
      throw new Error('Already cancelled');
    }

    // Simulate cancellation
    mockEscrow.cancelled = true;
    this.mockEscrows.set(escrowId, mockEscrow);

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return `0x${createHash('sha256').update(escrowId + 'cancel' + Date.now().toString()).digest('hex')}`;
  }

  async getBalance(address: string, tokenAddress: string): Promise<bigint> {
    // Return mock balance
    return BigInt('1000000000000000000'); // 1 token
  }

  async getBlockTimestamp(): Promise<bigint> {
    return BigInt(Math.floor(Date.now() / 1000));
  }

  isChainSupported(): boolean {
    return true;
  }
}