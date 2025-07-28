'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { SwapOrder } from '../types';
import { getChainById } from '../lib/chains';
import apiClient from '../lib/api';
import clsx from 'clsx';

interface SwapStatusProps {
  orderId: string;
  onClose: () => void;
}

const STATUS_CONFIG = {
  created: {
    icon: Clock,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    label: 'Created',
    description: 'Swap order has been created'
  },
  src_deployed: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100',
    label: 'Source Deployed',
    description: 'Source escrow has been deployed'
  },
  dst_deployed: {
    icon: Loader2,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100',
    label: 'Destination Deployed',
    description: 'Destination escrow has been deployed'
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-100',
    label: 'Completed',
    description: 'Swap has been completed successfully'
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-100',
    label: 'Failed',
    description: 'Swap has failed'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    label: 'Cancelled',
    description: 'Swap has been cancelled'
  }
};

export default function SwapStatus({ orderId, onClose }: SwapStatusProps) {
  const [swap, setSwap] = useState<SwapOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchSwapStatus = async () => {
      try {
        const swapData = await apiClient.getSwap(orderId);
        setSwap(swapData);
        setError(null);

        // Continue polling if swap is not in a final state
        if (!['completed', 'failed', 'cancelled'].includes(swapData.status)) {
          interval = setTimeout(fetchSwapStatus, 2000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch swap status');
      } finally {
        setLoading(false);
      }
    };

    fetchSwapStatus();

    return () => {
      if (interval) clearTimeout(interval);
    };
  }, [orderId]);

  const handleExecuteSwap = async () => {
    if (!swap) return;
    
    setExecuting(true);
    try {
      const result = await apiClient.executeSwap(orderId);
      if (result.success) {
        // Refresh swap status
        const updatedSwap = await apiClient.getSwap(orderId);
        setSwap(updatedSwap);
      } else {
        setError(result.error || 'Failed to execute swap');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute swap');
    } finally {
      setExecuting(false);
    }
  };

  const handleCancelSwap = async () => {
    if (!swap) return;
    
    try {
      const result = await apiClient.cancelSwap(orderId);
      if (result.success) {
        // Refresh swap status
        const updatedSwap = await apiClient.getSwap(orderId);
        setSwap(updatedSwap);
      } else {
        setError(result.error || 'Failed to cancel swap');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel swap');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span>Loading swap status...</span>
        </div>
      </div>
    );
  }

  if (error || !swap) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
          <p className="text-gray-600 mb-4">{error || 'Swap not found'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const srcChain = getChainById(swap.srcChain);
  const dstChain = getChainById(swap.dstChain);
  const statusConfig = STATUS_CONFIG[swap.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.created;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Swap Status</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Status Badge */}
      <div className="flex items-center space-x-3 mb-6">
        <div className={clsx('p-2 rounded-full', statusConfig.bgColor)}>
          <StatusIcon className={clsx('w-6 h-6', statusConfig.color, {
            'animate-spin': ['src_deployed', 'dst_deployed'].includes(swap.status)
          })} />
        </div>
        <div>
          <div className="font-semibold text-gray-900">{statusConfig.label}</div>
          <div className="text-sm text-gray-600">{statusConfig.description}</div>
        </div>
      </div>

      {/* Swap Details */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: srcChain?.color }}
            >
              {srcChain?.icon}
            </div>
            <div>
              <div className="font-medium">{srcChain?.name}</div>
              <div className="text-sm text-gray-600">{swap.srcToken}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">{swap.srcAmount}</div>
            <div className="text-xs text-gray-500">Amount</div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="text-gray-400">↓</div>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: dstChain?.color }}
            >
              {dstChain?.icon}
            </div>
            <div>
              <div className="font-medium">{dstChain?.name}</div>
              <div className="text-sm text-gray-600">{swap.dstToken}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">{swap.dstAmount}</div>
            <div className="text-xs text-gray-500">Amount</div>
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Order ID:</span>
          <span className="font-mono">{swap.orderId}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Maker:</span>
          <span className="font-mono">{swap.maker}</span>
        </div>
        {swap.srcEscrow && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Source Escrow:</span>
            <span className="font-mono flex items-center space-x-1">
              <span>{swap.srcEscrow}</span>
              <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        )}
        {swap.dstEscrow && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Destination Escrow:</span>
            <span className="font-mono flex items-center space-x-1">
              <span>{swap.dstEscrow}</span>
              <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Created:</span>
          <span>{new Date(swap.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {swap.status === 'created' && (
          <button
            onClick={handleExecuteSwap}
            disabled={executing}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {executing ? (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing...</span>
              </div>
            ) : (
              'Execute Swap'
            )}
          </button>
        )}

        {['created', 'src_deployed', 'dst_deployed'].includes(swap.status) && (
          <button
            onClick={handleCancelSwap}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Cancel
          </button>
        )}

        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}