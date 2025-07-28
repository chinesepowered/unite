export interface Chain {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  color: string;
  description: string;
}

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
  icon?: string;
}

export interface SwapOrder {
  orderId: string;
  status: string;
  srcChain: string;
  dstChain: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  maker: string;
  srcEscrow?: string;
  dstEscrow?: string;
  createdAt: string;
  updatedAt: string;
  secretHash?: string;
}

export interface SwapFormData {
  srcChain: string;
  dstChain: string;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  maker: string;
}

export interface ChainBalance {
  balance: string;
  formatted: string;
}