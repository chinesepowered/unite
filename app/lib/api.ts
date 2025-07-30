import axios from 'axios';
import { SwapOrder, SwapFormData, ChainBalance } from '../types';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const apiClient = {
  // Get supported chains
  getChains: async (): Promise<{ chains: string[] }> => {
    const response = await api.get('/chains');
    return response.data;
  },

  // Get chain balance
  getBalance: async (chain: string, address: string, token: string): Promise<ChainBalance> => {
    const response = await api.get(`/balance/${chain}/${address}/${token}`);
    return response.data;
  },

  // Create a new swap
  createSwap: async (swapData: SwapFormData): Promise<{
    orderId: string;
    status: string;
    secretHash: string;
    timelock?: {
      srcCancellation: string;
      dstCancellation: string;
    };
  }> => {
    const response = await api.post('/swap', swapData);
    return response.data;
  },

  // Execute a swap
  executeSwap: async (orderId: string): Promise<{
    success: boolean;
    srcEscrow?: string;
    dstEscrow?: string;
    txHash?: string;
    error?: string;
  }> => {
    const response = await api.post(`/swap/${orderId}/execute`);
    return response.data;
  },

  // Cancel a swap
  cancelSwap: async (orderId: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> => {
    const response = await api.post(`/swap/${orderId}/cancel`);
    return response.data;
  },

  // Get swap status
  getSwap: async (orderId: string): Promise<SwapOrder> => {
    const response = await api.get(`/swap/${orderId}`);
    return response.data;
  },

  // Get all swaps
  getAllSwaps: async (): Promise<{ swaps: SwapOrder[] }> => {
    const response = await api.get('/swaps');
    return response.data;
  },

  // Create demo swap
  createDemoSwap: async (params?: {
    srcChain?: string;
    dstChain?: string;
    srcToken?: string;
    dstToken?: string;
    srcAmount?: string;
    dstAmount?: string;
    maker?: string;
  }): Promise<{
    message: string;
    orderId: string;
    status: string;
    srcChain: string;
    dstChain: string;
    secretHash: string;
  }> => {
    const response = await api.post('/demo/swap', params || {});
    return response.data;
  },

  // Convenience methods for bidirectional swaps
  createEthToChainSwap: async (params: {
    dstChain: string;
    srcToken: string;
    dstToken: string;
    srcAmount: string;
    dstAmount: string;
    maker: string;
  }): Promise<{
    orderId: string;
    status: string;
    secretHash: string;
  }> => {
    const response = await api.post('/swap/eth-to-chain', params);
    return response.data;
  },

  createChainToEthSwap: async (params: {
    srcChain: string;
    srcToken: string;
    dstToken: string;
    srcAmount: string;
    dstAmount: string;
    maker: string;
  }): Promise<{
    orderId: string;
    status: string;
    secretHash: string;
  }> => {
    const response = await api.post('/swap/chain-to-eth', params);
    return response.data;
  },
};

export default apiClient;