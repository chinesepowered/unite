'use client';

import { useState, useEffect } from 'react';
import { ArrowUpDown, Zap, AlertCircle } from 'lucide-react';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import { SwapFormData } from '../types';
import { DEFAULT_AMOUNTS, TEST_ADDRESSES, formatAmount, parseAmount, getChainTokens } from '../lib/chains';
import clsx from 'clsx';

interface SwapFormProps {
  onSubmit: (data: SwapFormData) => void;
  loading: boolean;
}

export default function SwapForm({ onSubmit, loading }: SwapFormProps) {
  const [formData, setFormData] = useState<SwapFormData>({
    srcChain: 'ethereum',
    dstChain: 'stellar',
    srcToken: '0x0000000000000000000000000000000000000000',
    dstToken: 'native',
    srcAmount: DEFAULT_AMOUNTS.ethereum,
    dstAmount: DEFAULT_AMOUNTS.stellar,
    maker: TEST_ADDRESSES.maker,
  });

  const [displayAmounts, setDisplayAmounts] = useState({
    srcAmount: '1.0',
    dstAmount: '1.0',
  });

  // Update token addresses when chains change
  useEffect(() => {
    const srcTokens = getChainTokens(formData.srcChain);
    const dstTokens = getChainTokens(formData.dstChain);
    
    if (srcTokens.length > 0 && dstTokens.length > 0) {
      setFormData(prev => ({
        ...prev,
        srcToken: srcTokens[0].address,
        dstToken: dstTokens[0].address,
        srcAmount: DEFAULT_AMOUNTS[prev.srcChain] || '1000000000000000000',
        dstAmount: DEFAULT_AMOUNTS[prev.dstChain] || '1000000000000000000',
      }));

      // Update display amounts
      const srcDecimals = srcTokens[0].decimals;
      const dstDecimals = dstTokens[0].decimals;
      setDisplayAmounts({
        srcAmount: formatAmount(DEFAULT_AMOUNTS[formData.srcChain] || '1000000000000000000', srcDecimals),
        dstAmount: formatAmount(DEFAULT_AMOUNTS[formData.dstChain] || '1000000000000000000', dstDecimals),
      });
    }
  }, [formData.srcChain, formData.dstChain]);

  const handleSwapDirection = () => {
    setFormData(prev => ({
      ...prev,
      srcChain: prev.dstChain,
      dstChain: prev.srcChain,
      srcToken: prev.dstToken,
      dstToken: prev.srcToken,
      srcAmount: prev.dstAmount,
      dstAmount: prev.srcAmount,
    }));
  };

  const handleAmountChange = (field: 'srcAmount' | 'dstAmount', value: string) => {
    setDisplayAmounts(prev => ({ ...prev, [field]: value }));
    
    // Convert to wei/smallest unit when updating form data
    const decimals = field === 'srcAmount' 
      ? getChainTokens(formData.srcChain)[0]?.decimals || 18
      : getChainTokens(formData.dstChain)[0]?.decimals || 18;
    
    const parsedAmount = parseAmount(value || '0', decimals);
    setFormData(prev => ({ ...prev, [field]: parsedAmount }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isFormValid = formData.srcChain && formData.dstChain && 
                     formData.srcToken && formData.dstToken && 
                     formData.srcAmount && formData.dstAmount && 
                     formData.maker && formData.srcChain !== formData.dstChain;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center space-x-2 mb-6">
        <Zap className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-gray-900">Cross-Chain Swap</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source Chain */}
        <ChainSelector
          selectedChain={formData.srcChain}
          onChainSelect={(chainId) => setFormData(prev => ({ ...prev, srcChain: chainId }))}
          excludeChain={formData.dstChain}
          label="From Chain"
        />

        {/* Source Token & Amount */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Token & Amount
          </label>
          <div className="flex space-x-3">
            <div className="flex-1">
              <TokenSelector
                chainId={formData.srcChain}
                selectedToken={formData.srcToken}
                onTokenSelect={(tokenAddress) => 
                  setFormData(prev => ({ ...prev, srcToken: tokenAddress }))
                }
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={displayAmounts.srcAmount}
                onChange={(e) => handleAmountChange('srcAmount', e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSwapDirection}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={loading}
          >
            <ArrowUpDown className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Destination Chain */}
        <ChainSelector
          selectedChain={formData.dstChain}
          onChainSelect={(chainId) => setFormData(prev => ({ ...prev, dstChain: chainId }))}
          excludeChain={formData.srcChain}
          label="To Chain"
        />

        {/* Destination Token & Amount */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Token & Amount
          </label>
          <div className="flex space-x-3">
            <div className="flex-1">
              <TokenSelector
                chainId={formData.dstChain}
                selectedToken={formData.dstToken}
                onTokenSelect={(tokenAddress) => 
                  setFormData(prev => ({ ...prev, dstToken: tokenAddress }))
                }
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={displayAmounts.dstAmount}
                onChange={(e) => handleAmountChange('dstAmount', e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Maker Address */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Maker Address
          </label>
          <input
            type="text"
            value={formData.maker}
            onChange={(e) => setFormData(prev => ({ ...prev, maker: e.target.value }))}
            placeholder="0x..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Warning */}
        {formData.srcChain === formData.dstChain && (
          <div className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              Source and destination chains must be different for cross-chain swaps.
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isFormValid || loading}
          className={clsx(
            'w-full py-3 px-4 rounded-md font-semibold text-white transition-colors',
            isFormValid && !loading
              ? 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
              : 'bg-gray-400 cursor-not-allowed'
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Creating Swap...</span>
            </div>
          ) : (
            'Create Cross-Chain Swap'
          )}
        </button>
      </form>
    </div>
  );
}