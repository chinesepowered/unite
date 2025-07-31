'use client';

import { Chain } from '../types';
import { SUPPORTED_CHAINS } from '../lib/chains';
import clsx from 'clsx';

interface ChainSelectorProps {
  selectedChain: string;
  onChainSelect: (chainId: string) => void;
  excludeChain?: string;
  label: string;
}

export default function ChainSelector({ 
  selectedChain, 
  onChainSelect, 
  excludeChain,
  label 
}: ChainSelectorProps) {
  const availableChains = SUPPORTED_CHAINS.filter(chain => 
    !excludeChain || chain.id !== excludeChain
  );

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {availableChains.map((chain) => (
          <button
            key={chain.id}
            type="button"
            onClick={() => onChainSelect(chain.id)}
            className={clsx(
              'chain-card p-4 rounded-lg border-2 text-left transition-all',
              selectedChain === chain.id
                ? 'selected bg-blue-50 border-blue-500'
                : 'bg-white border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="flex items-center space-x-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold"
                style={{ backgroundColor: chain.color }}
              >
                {chain.icon}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{chain.name}</div>
                <div className="text-sm text-gray-500">{chain.symbol}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              {chain.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}