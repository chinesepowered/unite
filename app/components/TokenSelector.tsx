'use client';

import { getChainTokens } from '../lib/chains';
import clsx from 'clsx';

interface TokenSelectorProps {
  chainId: string;
  selectedToken: string;
  onTokenSelect: (tokenAddress: string) => void;
}

export default function TokenSelector({ 
  chainId, 
  selectedToken, 
  onTokenSelect 
}: TokenSelectorProps) {
  const tokens = getChainTokens(chainId);

  if (tokens.length === 0) {
    return (
      <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500">
        No tokens available
      </div>
    );
  }

  return (
    <select
      value={selectedToken}
      onChange={(e) => onTokenSelect(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
    >
      {tokens.map((token) => (
        <option key={token.address} value={token.address}>
          {token.symbol}
        </option>
      ))}
    </select>
  );
}