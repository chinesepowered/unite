'use client';

import { useState } from 'react';
import { Zap, Github, ExternalLink, AlertTriangle } from 'lucide-react';
import SwapForm from './components/SwapForm';
import SwapStatus from './components/SwapStatus';
import SwapHistory from './components/SwapHistory';
import NetworkStatus from './components/NetworkStatus';
import { SwapFormData } from './types';
import apiClient from './lib/api';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'form' | 'status'>('form');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleSwapSubmit = async (formData: SwapFormData) => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.createSwap(formData);
      setSelectedOrderId(result.orderId);
      setCurrentView('status');
      setHistoryRefresh(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create swap');
    } finally {
      setLoading(false);
    }
  };

  const handleSwapSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    setCurrentView('status');
  };

  const handleBackToForm = () => {
    setCurrentView('form');
    setSelectedOrderId(null);
    setError(null);
  };

  const handleQuickDemo = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.createDemoSwap({
        srcChain: 'base',
        dstChain: 'stellar'
      });
      setSelectedOrderId(result.orderId);
      setCurrentView('status');
      setHistoryRefresh(prev => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create demo swap');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="gradient-bg text-white py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Zap className="w-8 h-8" />
              <div>
                <h1 className="text-3xl font-bold">Fusion+ Multi-Chain</h1>
                <p className="text-blue-100">Cross-chain atomic swaps powered by HTLC</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="https://github.com/your-repo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                <Github className="w-4 h-4" />
                <span className="hidden sm:inline">Source</span>
              </a>
              <button
                onClick={handleQuickDemo}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 text-yellow-900 rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>Quick Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Chains Banner */}
      <div className="bg-white border-b border-gray-200 py-4 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center space-x-8 text-sm text-gray-600">
            <span className="font-medium">Supported:</span>
            <div className="flex items-center space-x-1">
              <span>⚡</span>
              <span>Ethereum</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🚀</span>
              <span>Monad</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>✨</span>
              <span>Stellar</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🔵</span>
              <span>Sui</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>🌟</span>
              <span>Tron</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-900">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Network Status */}
        <NetworkStatus />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Panel */}
          <div className="lg:col-span-2">
            {currentView === 'form' ? (
              <SwapForm onSubmit={handleSwapSubmit} loading={loading} />
            ) : selectedOrderId ? (
              <SwapStatus orderId={selectedOrderId} onClose={handleBackToForm} />
            ) : null}
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Quick Info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">How it Works</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">1</div>
                  <div>Create cross-chain swap order with HTLC parameters</div>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">2</div>
                  <div>Escrows deployed on both source and destination chains</div>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">3</div>
                  <div>Atomic execution using secret reveal mechanism</div>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">✓</div>
                  <div>Funds safely transferred or refunded via timelock</div>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Features</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>✅ HTLC with hashlock & timelock</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>✅ Bidirectional swaps</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>✅ Atomic execution</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>✅ Multi-chain support</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>🔶 Resolver automation</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>🔶 Partial fills (planned)</span>
                </div>
              </div>
            </div>

            {/* API Info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">API Endpoints</h3>
              <div className="space-y-2 text-xs font-mono text-gray-600">
                <div>GET /api/chains</div>
                <div>POST /api/swap</div>
                <div>GET /api/swap/:id</div>
                <div>POST /api/swap/:id/execute</div>
                <div>POST /api/demo/swap</div>
              </div>
              <a
                href="/api/chains"
                target="_blank"
                className="inline-flex items-center space-x-1 mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                <span>View API</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Swap History */}
        <div className="mt-8">
          <SwapHistory onSwapSelect={handleSwapSelect} refreshTrigger={historyRefresh} />
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 text-white py-8 px-4 mt-16">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Zap className="w-6 h-6" />
            <span className="text-xl font-bold">Fusion+ Multi-Chain</span>
          </div>
          <p className="text-gray-400 mb-4">
            Built for the 1inch Hackathon • Cross-chain atomic swaps with HTLC
          </p>
          <div className="flex items-center justify-center space-x-6 text-sm text-gray-400">
            <span>Ethereum ⚡</span>
            <span>Monad 🚀</span>
            <span>Stellar ✨</span>
            <span>Sui 🔵</span>
            <span>Tron 🌟</span>
          </div>
        </div>
      </div>
    </div>
  );
}