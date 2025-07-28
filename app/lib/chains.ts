import { Chain, Token } from '../types';

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: '⚡',
    color: '#627eea',
    description: 'The leading smart contract platform'
  },
  {
    id: 'monad',
    name: 'Monad',
    symbol: 'MON',
    icon: '🚀',
    color: '#ff6b35',
    description: 'High-performance EVM-compatible chain'
  },
  {
    id: 'stellar',
    name: 'Stellar',
    symbol: 'XLM',
    icon: '✨',
    color: '#7c4dff',
    description: 'Fast, low-cost payments platform'
  },
  {
    id: 'sui',
    name: 'Sui',
    symbol: 'SUI',
    icon: '🔵',
    color: '#4da6ff',
    description: 'Move-based layer 1 blockchain'
  },
  {
    id: 'tron',
    name: 'Tron',
    symbol: 'TRX',
    icon: '🌟',
    color: '#ff0013',
    description: 'Decentralized entertainment ecosystem'
  }
];

export const CHAIN_TOKENS: Record<string, Token[]> = {
  ethereum: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'USDC', address: '0xA0b86a33E6441c8C47ed7E37d59D3d4a16D35f73', decimals: 6 },
  ],
  monad: [
    { symbol: 'MON', address: 'native', decimals: 18 },
  ],
  stellar: [
    { symbol: 'XLM', address: 'native', decimals: 7 },
  ],
  sui: [
    { symbol: 'SUI', address: '0x2::sui::SUI', decimals: 9 },
  ],
  tron: [
    { symbol: 'TRX', address: 'native', decimals: 6 },
  ]
};

export const DEFAULT_AMOUNTS: Record<string, string> = {
  ethereum: '1000000000000000000', // 1 ETH
  monad: '1000000000000000000', // 1 MON
  stellar: '10000000', // 1 XLM (7 decimals)
  sui: '1000000000', // 1 SUI (9 decimals)
  tron: '1000000', // 1 TRX (6 decimals)
};

export const TEST_ADDRESSES = {
  maker: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  resolver: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
};

export function getChainById(chainId: string): Chain | undefined {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
}

export function getChainTokens(chainId: string): Token[] {
  return CHAIN_TOKENS[chainId] || [];
}

export function formatAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return num.toFixed(Math.min(decimals, 6));
}

export function parseAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) * Math.pow(10, decimals);
  return Math.floor(num).toString();
}