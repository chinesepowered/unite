import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: {
    orderId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orderId } = params;
    
    // For hackathon demo - return a realistic swap order structure
    // In production, this would query the database/blockchain state
    
    const swapOrder = {
      orderId,
      status: 'created', // created, src_deployed, dst_deployed, completed, failed, cancelled
      srcChain: 'base',
      dstChain: 'stellar',
      makingAmount: '1000000000000000000', // 1 ETH
      takingAmount: '10000000', // 1 XLM (7 decimals)
      makerAsset: '0x0000000000000000000000000000000000000000', // ETH
      takerAsset: 'native', // XLM
      maker: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      secretHash: '0x' + 'a'.repeat(64), // Would be real secret hash
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Include contract information
      contracts: {
        srcContract: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44', // Base LOP
        dstContract: 'CAPWY2XT62L3A3VBPVS4IOHDQJDULCLR2QNZ5724PBOROLVKQXYH6ZZ7' // Stellar HTLC
      },
      timelock: {
        srcCancellation: (Math.floor(Date.now() / 1000) + 3600).toString(),
        dstCancellation: (Math.floor(Date.now() / 1000) + 1800).toString()
      }
    };
    
    return NextResponse.json(swapOrder);
  } catch (error) {
    console.error('Error getting swap:', error);
    return NextResponse.json(
      { error: 'Failed to get swap details' },
      { status: 500 }
    );
  }
}