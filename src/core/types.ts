// Core types for cross-chain swaps

export interface ChainConfig {
  chainId: string;
  rpcUrl: string;
  escrowFactory?: string;
  resolver?: string;
  feeToken?: string;
  supportedTokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
  }>;
}

export interface SwapOrder {
  orderId: string;
  maker: string;
  makingAmount: bigint;
  takingAmount: bigint;
  makerAsset: string;
  takerAsset: string;
  srcChainId: string;
  dstChainId: string;
  secret?: string;
  secretHash: string;
  timelock: {
    srcWithdrawal: bigint;
    srcPublicWithdrawal: bigint;
    srcCancellation: bigint;
    srcPublicCancellation: bigint;
    dstWithdrawal: bigint;
    dstPublicWithdrawal: bigint;
    dstCancellation: bigint;
  };
  safetyDeposit: {
    src: bigint;
    dst: bigint;
  };
}

export interface EscrowDetails {
  address: string;
  immutables: any;
  deployedAt?: bigint;
}

export interface SwapResult {
  success: boolean;
  srcEscrow?: EscrowDetails;
  dstEscrow?: EscrowDetails;
  txHash?: string;
  error?: string;
}

export abstract class ChainAdapter {
  protected config: ChainConfig;

  constructor(config: ChainConfig) {
    this.config = config;
  }

  abstract deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
  abstract withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
  abstract cancel(escrow: EscrowDetails): Promise<string>;
  abstract getBalance(address: string, tokenAddress: string): Promise<bigint>;
  abstract getBlockTimestamp(): Promise<bigint>;
  abstract isChainSupported(): boolean;
}

export enum SwapStatus {
  CREATED = 'created',
  SRC_DEPLOYED = 'src_deployed', 
  DST_DEPLOYED = 'dst_deployed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

export interface SwapState {
  order: SwapOrder;
  status: SwapStatus;
  srcEscrow?: EscrowDetails;
  dstEscrow?: EscrowDetails;
  createdAt: Date;
  updatedAt: Date;
}