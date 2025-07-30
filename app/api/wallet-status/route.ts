import { NextResponse } from 'next/server';
import { getChainAdapter } from '../../lib/real-chain-adapters';

export async function GET() {
  try {
    const walletStatus = {
      timestamp: new Date().toISOString(),
      ready: true,
      wallets: {} as Record<string, any>
    };

    // Check each supported chain
    const chains = ['base', 'stellar', 'sui'];
    
    for (const chainId of chains) {
      try {
        const adapter = getChainAdapter(chainId);
        const balance = await adapter.getBalance();
        
        walletStatus.wallets[chainId] = {
          status: 'ready',
          balance: balance,
          hasPrivateKey: !!process.env[`${chainId.toUpperCase()}_PRIVATE_KEY`]
        };
      } catch (error) {
        walletStatus.wallets[chainId] = {
          status: 'error',
          balance: '0',
          hasPrivateKey: !!process.env[`${chainId.toUpperCase()}_PRIVATE_KEY`],
          error: error instanceof Error ? error.message : String(error)
        };
        walletStatus.ready = false;
      }
    }

    return NextResponse.json(walletStatus);
    
  } catch (error) {
    console.error('Error getting wallet status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get wallet status',
        details: error instanceof Error ? error.message : String(error),
        ready: false
      },
      { status: 500 }
    );
  }
}