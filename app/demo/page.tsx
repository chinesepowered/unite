'use client';

import { useState } from 'react';

interface SwapResult {
  success: boolean;
  pending?: boolean;
  orderId?: string;
  message?: string;
  results?: Array<{
    chain: string;
    type: string;
    txHash: string;
    explorerUrl: string;
  }>;
  errors?: string[];
  atomicSwapSteps?: {
    escrowsCreated: number;
    claimsCompleted: number;
    totalTransactions: number;
  };
}

interface SwapConfig {
  id: number;
  title: string;
  srcChain: string;
  dstChain: string;
  srcToken: string;
  dstToken: string;
  amount: string;
  description: string;
  srcIcon: string;
  dstIcon: string;
  gradient: string;
}

const swapConfigs: SwapConfig[] = [
  {
    id: 1,
    title: "Base → Monad",
    srcChain: "base",
    dstChain: "monad", 
    srcToken: "ETH",
    dstToken: "MON",
    amount: "0.001",
    description: "Base Sepolia to Monad Testnet",
    srcIcon: "🔵",
    dstIcon: "⚡",
    gradient: "from-blue-500 to-purple-600"
  },
  {
    id: 2,
    title: "Monad → Base",
    srcChain: "monad",
    dstChain: "base",
    srcToken: "MON", 
    dstToken: "ETH",
    amount: "0.001",
    description: "Monad Testnet to Base Sepolia",
    srcIcon: "⚡",
    dstIcon: "🔵",
    gradient: "from-purple-600 to-blue-500"
  },
  {
    id: 3,
    title: "Base → Sui",
    srcChain: "base",
    dstChain: "sui",
    srcToken: "ETH",
    dstToken: "SUI", 
    amount: "0.001",
    description: "Base Sepolia to Sui Testnet",
    srcIcon: "🔵",
    dstIcon: "🌊",
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    id: 4,
    title: "Sui → Base",
    srcChain: "sui",
    dstChain: "base",
    srcToken: "SUI",
    dstToken: "ETH",
    amount: "0.001", 
    description: "Sui Testnet to Base Sepolia",
    srcIcon: "🌊",
    dstIcon: "🔵",
    gradient: "from-cyan-500 to-blue-500"
  },
  {
    id: 5,
    title: "Base → Stellar",
    srcChain: "base",
    dstChain: "stellar",
    srcToken: "ETH",
    dstToken: "XLM",
    amount: "0.001",
    description: "Base Sepolia to Stellar Testnet", 
    srcIcon: "🔵",
    dstIcon: "⭐",
    gradient: "from-blue-500 to-yellow-500"
  },
  {
    id: 6,
    title: "Stellar → Base",
    srcChain: "stellar",
    dstChain: "base",
    srcToken: "XLM",
    dstToken: "ETH",
    amount: "0.001",
    description: "Stellar Testnet to Base Sepolia",
    srcIcon: "⭐", 
    dstIcon: "🔵",
    gradient: "from-yellow-500 to-blue-500"
  },

];

// Helper function to calculate correct amounts for each chain (0.001 units)
const getChainAmount = (chain: string): string => {
  switch (chain) {
    case 'base':
    case 'monad':
      return "1000000000000000"; // 0.001 ETH/MON in wei
    case 'sui':
      return "1000000"; // 0.001 SUI in MIST
    case 'stellar':
      return "10000"; // 0.001 XLM in stroops
    default:
      return "1000000000000000"; // Default to wei
  }
};

export default function DemoPage() {
  const [results, setResults] = useState<Record<number, SwapResult>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});

  const executeSwap = async (config: SwapConfig) => {
    setLoading(prev => ({ ...prev, [config.id]: true }));
    setResults(prev => ({ ...prev, [config.id]: { success: false, message: 'Executing...', pending: true } }));

    try {
      // Step 1: Create swap
      const createResponse = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcChain: config.srcChain,
          dstChain: config.dstChain,
          srcAmount: getChainAmount(config.srcChain), // Correct amount for source chain
          dstAmount: getChainAmount(config.dstChain), // Correct amount for destination chain
          srcToken: config.srcToken,
          dstToken: config.dstToken
        })
      });

      const createData = await createResponse.json();
      
      if (!createResponse.ok || !createData.orderId) {
        throw new Error(createData.error || 'Failed to create swap');
      }

      // Step 2: Execute swap
      const executeResponse = await fetch(`/api/execute-swap?orderId=${createData.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const executeData = await executeResponse.json();
      setResults(prev => ({ ...prev, [config.id]: executeData }));

    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        [config.id]: { 
          success: false, 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      }));
    } finally {
      setLoading(prev => ({ ...prev, [config.id]: false }));
    }
  };

  const getStatusColor = (result?: SwapResult) => {
    if (!result) return 'border-gray-200';
    if (result.pending) return 'border-blue-500 bg-blue-50';
    if (result.success && result.atomicSwapSteps?.totalTransactions === 4) return 'border-green-500 bg-green-50';
    if (result.success && result.atomicSwapSteps && result.atomicSwapSteps.totalTransactions > 0) return 'border-yellow-500 bg-yellow-50';
    return 'border-red-500 bg-red-50';
  };

  const getStatusIcon = (result?: SwapResult) => {
    if (!result) return '⏳';
    if (result.pending) return '🔄';
    if (result.success && result.atomicSwapSteps?.totalTransactions === 4) return '🎉';
    if (result.success && result.atomicSwapSteps && result.atomicSwapSteps.totalTransactions > 0) return '⚡';
    return '❌';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <a 
                href="/"
                className="inline-flex items-center space-x-2 text-gray-300 hover:text-white mb-4 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Back to Swap Form</span>
              </a>
              <h1 className="text-3xl font-bold text-white">
                🚀 United Demo
              </h1>
              <p className="text-gray-300 mt-2">
                Live cross-chain atomic swaps with real blockchain transactions
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Hackathon Demo</div>
              <div className="text-lg font-semibold text-white">4-Transaction HTLCs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {swapConfigs.map((config) => (
            <div
              key={config.id}
              className={`bg-white/10 backdrop-blur-sm rounded-2xl border transition-all duration-300 hover:scale-[1.02] ${getStatusColor(results[config.id])}`}
            >
              {/* Swap Card Header */}
              <div className={`bg-gradient-to-r ${config.gradient} p-6 rounded-t-2xl`}>
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{config.srcIcon}</div>
                    <div className="text-2xl">→</div>
                    <div className="text-2xl">{config.dstIcon}</div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-xl font-bold">{config.title}</h3>
                    <p className="text-white/80">{config.description}</p>
                  </div>
                </div>
              </div>

              {/* Swap Details */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-400">From</div>
                      <div className="font-semibold text-white">{config.amount} {config.srcToken}</div>
                      <div className="text-xs text-gray-500">{config.srcChain}</div>
                    </div>
                    <div className="text-gray-400">⟷</div>
                    <div className="text-center">
                      <div className="text-sm text-gray-400">To</div>
                      <div className="font-semibold text-white">{config.amount} {config.dstToken}</div>
                      <div className="text-xs text-gray-500">{config.dstChain}</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => executeSwap(config)}
                    disabled={loading[config.id]}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                      loading[config.id]
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {loading[config.id] ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-transparent"></div>
                        <span>Executing...</span>
                      </div>
                    ) : (
                      'Execute Swap'
                    )}
                  </button>
                </div>

                {/* Results */}
                {results[config.id] && (
                  <div className="mt-6 bg-black/20 rounded-xl p-4 backdrop-blur-sm">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="text-2xl">{getStatusIcon(results[config.id])}</div>
                      <div className="font-semibold text-white">
                        {results[config.id].pending ? 'Swap Pending' : results[config.id].success ? 'Swap Executed' : 'Swap Failed'}
                      </div>
                      {results[config.id].orderId && (
                        <div className="text-xs bg-purple-600/30 px-2 py-1 rounded text-purple-200">
                          {results[config.id].orderId?.slice(0, 10)}...
                        </div>
                      )}
                    </div>

                    {results[config.id].message && (
                      <div className="text-sm text-gray-300 mb-3">
                        {results[config.id].message}
                      </div>
                    )}

                    {/* Transaction Summary */}
                    {results[config.id].atomicSwapSteps && (
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-400">
                            {results[config.id].atomicSwapSteps!.escrowsCreated}
                          </div>
                          <div className="text-xs text-gray-400">Escrows Created</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-400">
                            {results[config.id].atomicSwapSteps!.claimsCompleted}
                          </div>
                          <div className="text-xs text-gray-400">Claims Completed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-purple-400">
                            {results[config.id].atomicSwapSteps!.totalTransactions}
                          </div>
                          <div className="text-xs text-gray-400">Total Transactions</div>
                        </div>
                      </div>
                    )}

                    {/* Transaction Details */}
                    {results[config.id].results && results[config.id].results!.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-gray-300">Transactions:</div>
                        {results[config.id].results!.map((tx, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <div className="text-xs bg-gray-600 px-2 py-1 rounded text-gray-200">
                                {tx.type.replace('_', ' ')}
                              </div>
                              <div className="text-xs text-gray-400">{tx.chain}</div>
                            </div>
                            <a
                              href={tx.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                            >
                              <span>{tx.txHash.slice(0, 8)}...{tx.txHash.slice(-6)}</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Errors */}
                    {results[config.id].errors && results[config.id].errors!.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-semibold text-red-400 mb-2">Errors:</div>
                        {results[config.id].errors!.map((error, idx) => (
                          <div key={idx} className="text-xs text-red-300 bg-red-900/20 p-2 rounded">
                            {error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-12 bg-black/20 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="text-center">
            <h3 className="text-xl font-bold text-white mb-4">🎯 How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
              <div className="text-center">
                <div className="text-2xl mb-2">1️⃣</div>
                <div className="font-semibold text-white">Alice Creates Escrow</div>
                <div className="text-gray-400">Locks funds on source chain</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">2️⃣</div>
                <div className="font-semibold text-white">Bob Creates Escrow</div>
                <div className="text-gray-400">Locks funds on destination chain</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">3️⃣</div>
                <div className="font-semibold text-white">Alice Claims</div>
                <div className="text-gray-400">Reveals secret, gets Bob's funds</div>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-2">4️⃣</div>
                <div className="font-semibold text-white">Bob Claims</div>
                <div className="text-gray-400">Uses revealed secret, gets Alice's funds</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}