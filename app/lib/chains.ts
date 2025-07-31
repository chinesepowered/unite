import { Chain, Token } from '../types';

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 'base',
    name: 'Base',
    symbol: 'ETH',
    icon: '🔵',
    color: '#0052ff',
    description: 'Coinbase L2 with 1inch LOP integration'
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
  base: [
    { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 }, // Base USDC
    { symbol: 'USDbC', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6 }, // Bridged USDC
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
  base: '1000000000000000', // 0.001 ETH
  monad: '1000000000000000', // 0.001 MON  
  stellar: '10000', // 0.001 XLM (7 decimals)
  sui: '1000000', // 0.001 SUI (9 decimals)
  tron: '1000', // 0.001 TRX (6 decimals)
};

export const TEST_ADDRESSES = {
  maker: '0x6Bd07000C5F746af69BEe7f151eb30285a6678B2',
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