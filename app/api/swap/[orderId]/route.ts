import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: {
    orderId: string;
  };
}

// Simple in-memory mock for demo - simulates swap progression
const swapProgressMock = new Map<string, { status: string; startTime: number; srcChain: string; dstChain: string; }>();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orderId } = params;
    console.log(`🔍 GET /api/swap/${orderId} - Mock demo response`);
    
    // Initialize if first time
    if (!swapProgressMock.has(orderId)) {
      swapProgressMock.set(orderId, {
        status: 'created',
        startTime: Date.now(),
        srcChain: 'base',  // Will be updated when we get real data
        dstChain: 'monad'
      });
    }
    
    const swap = swapProgressMock.get(orderId)!;
    const elapsed = Date.now() - swap.startTime;
    
    // Simulate progression: created -> src_deployed -> dst_deployed -> completed
    if (elapsed > 15000) { // 15 seconds
      swap.status = 'completed';
    } else if (elapsed > 10000) { // 10 seconds  
      swap.status = 'dst_deployed';
    } else if (elapsed > 5000) { // 5 seconds
      swap.status = 'src_deployed';
    }
    
    return NextResponse.json({
      orderId,
      status: swap.status,
      srcChain: swap.srcChain,
      dstChain: swap.dstChain,
      makingAmount: '1000000000000000',
      takingAmount: '1000000000000000',
      makerAsset: '0x0000000000000000000000000000000000000000',
      takerAsset: 'native',
      maker: '0x6Bd07000C5F746af69BEe7f151eb30285a6678B2',
      secretHash: '0x' + 'a'.repeat(64),
      createdAt: new Date(swap.startTime).toISOString(),
      updatedAt: new Date().toISOString(),
      contracts: {
        srcContract: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44',
        dstContract: '0x0A027767aC1e4aA5474A1B98C3eF730C3994E67b'
      },
      timelock: {
        srcCancellation: (Math.floor(Date.now() / 1000) + 3600).toString(),
        dstCancellation: (Math.floor(Date.now() / 1000) + 1800).toString()
      },
      // Add demo transaction hashes when "deployed"
      transactions: swap.status !== 'created' ? {
        srcTx: swap.status === 'src_deployed' || swap.status === 'dst_deployed' || swap.status === 'completed' 
          ? 'https://sepolia.basescan.org/tx/0xdemo...base' : null,
        dstTx: swap.status === 'dst_deployed' || swap.status === 'completed'
          ? 'https://testnet.monadexplorer.com/tx/0xdemo...monad' : null
      } : null
    });
  } catch (error) {
    console.error('❌ Error getting swap:', error);
    return NextResponse.json(
      { error: 'Failed to get swap details' },
      { status: 500 }
    );
  }
}