'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { SwapOrder } from '../types';
import { getChainById } from '../lib/chains';
import apiClient from '../lib/api';
import clsx from 'clsx';

interface SwapHistoryProps {
  onSwapSelect: (orderId: string) => void;
  refreshTrigger: number;
}

export default function SwapHistory({ onSwapSelect, refreshTrigger }: SwapHistoryProps) {
  const [swaps, setSwaps] = useState<SwapOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSwaps = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getAllSwaps();
      setSwaps(response.swaps.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch swaps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSwaps();
  }, [refreshTrigger]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      case 'cancelled':
        return 'status-cancelled';
      case 'src_deployed':
        return 'status-src-deployed';
      case 'dst_deployed':
        return 'status-dst-deployed';
      default:
        return 'status-created';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span>Loading swap history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center">
          <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchSwaps}
            className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Recent Swaps</h2>
        <button
          onClick={fetchSwaps}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {swaps.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No swaps found</p>
          <p className="text-sm text-gray-400 mt-2">Create your first cross-chain swap above</p>
        </div>
      ) : (
        <div className="space-y-4">
          {swaps.map((swap) => {
            const srcChain = getChainById(swap.srcChain);
            const dstChain = getChainById(swap.dstChain);

            return (
              <div
                key={swap.orderId}
                onClick={() => onSwapSelect(swap.orderId)}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(swap.status)}
                    <span className={clsx('status-badge', getStatusBadgeClass(swap.status))}>
                      {swap.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(swap.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Source Chain */}
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: srcChain?.color }}
                      >
                        {srcChain?.icon}
                      </div>
                      <span className="text-sm font-medium">{srcChain?.name}</span>
                    </div>

                    <div className="text-gray-400">→</div>

                    {/* Destination Chain */}
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: dstChain?.color }}
                      >
                        {dstChain?.icon}
                      </div>
                      <span className="text-sm font-medium">{dstChain?.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-gray-500">
                      {swap.orderId.slice(0, 8)}...
                    </span>
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </div>
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  {swap.srcAmount} → {swap.dstAmount}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}