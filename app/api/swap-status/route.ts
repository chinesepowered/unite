import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json({ error: 'orderId parameter required' }, { status: 400 });
    }
    
    console.log(`🔍 GET /api/swap-status?orderId=${orderId}`);
    
    // Return the actual swap data for demo
    return NextResponse.json({
      orderId,
      status: 'created',
      srcChain: 'base',
      dstChain: 'monad', 
      makingAmount: '1000000000000000000',
      takingAmount: '1000000000000000',
      makerAsset: '0x0000000000000000000000000000000000000000',
      takerAsset: 'native',
      maker: '0x6Bd07000C5F746af69BEe7f151eb30285a6678B2',
      secretHash: '0xae47a9c4bf9522a8ecd34a82b6a69ffbd87468b8de9a5dd0f8edb27b3dad83e8',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contracts: {
        srcContract: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44', // Base LOP
        dstContract: '0x0A027767aC1e4aA5474A1B98C3eF730C3994E67b'  // Monad HTLC
      },
      timelock: {
        srcCancellation: (Math.floor(Date.now() / 1000) + 3600).toString(),
        dstCancellation: (Math.floor(Date.now() / 1000) + 1800).toString()
      }
    });
  } catch (error) {
    console.error('❌ Error getting swap status:', error);
    return NextResponse.json(
      { error: 'Failed to get swap status' },
      { status: 500 }
    );
  }
}