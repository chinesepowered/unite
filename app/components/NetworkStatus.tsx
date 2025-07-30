'use client';

import { useState, useEffect } from 'react';
import { Network, Server, AlertCircle, CheckCircle } from 'lucide-react';
import apiClient from '../lib/api';

interface NetworkInfo {
  network: string;
  chains: string[];
  ethereumMode: string;
}

export default function NetworkStatus() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNetworkInfo = async () => {
      try {
        const response = await apiClient.getChains();
        // In a real implementation, you'd add an endpoint that returns network info
        // For now, we'll infer from the available chains
        setNetworkInfo({
          network: process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet',
          chains: response.chains,
          ethereumMode: 'auto-detected' // Would come from backend
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch network info');
      } finally {
        setLoading(false);
      }
    };

    fetchNetworkInfo();
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-2">
          <Server className="w-4 h-4 text-blue-600 animate-pulse" />
          <span className="text-sm text-blue-800">Detecting network...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-800">Network detection failed: {error}</span>
        </div>
      </div>
    );
  }

  if (!networkInfo) return null;

  const isTestnet = networkInfo.network === 'testnet';

  return (
    <div className={`border rounded-lg p-4 mb-6 ${
      isTestnet 
        ? 'bg-yellow-50 border-yellow-200' 
        : 'bg-green-50 border-green-200'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <Network className={`w-5 h-5 mt-0.5 ${
            isTestnet ? 'text-yellow-600' : 'text-green-600'
          }`} />
          <div>
            <div className="flex items-center space-x-2">
              <h3 className={`font-medium ${
                isTestnet ? 'text-yellow-900' : 'text-green-900'
              }`}>
                {isTestnet ? '🧪 Testnet Mode' : '🌐 Mainnet Mode'}
              </h3>
              <span className={`text-xs px-2 py-1 rounded-full ${
                isTestnet 
                  ? 'bg-yellow-200 text-yellow-800' 
                  : 'bg-green-200 text-green-800'
              }`}>
                {networkInfo.chains.length} chains
              </span>
            </div>
            <div className={`text-sm mt-1 ${
              isTestnet ? 'text-yellow-800' : 'text-green-800'
            }`}>
              {isTestnet ? (
                <>
                  <div className="flex items-center space-x-1 mb-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Ethereum: Simple HTLC contracts</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Other chains: Custom HTLC contracts</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-1 mb-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Ethereum: 1inch production infrastructure</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Other chains: Production HTLC contracts</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs ${
            isTestnet ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {isTestnet ? 'Demo Ready' : 'Production'}
          </div>
        </div>
      </div>
    </div>
  );
}