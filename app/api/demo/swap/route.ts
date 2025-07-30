import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create a real swap order structure
    const orderId = '0x' + randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const secretHash = '0x' + createHash('sha256').update(secret, 'hex').digest('hex');
    
    const srcChain = body.srcChain || 'base';
    const dstChain = body.dstChain || 'stellar';
    
    // For hackathon demo - create real swap structure but simplified execution
    const swapResult = {
      message: `Cross-chain swap created: ${srcChain} → ${dstChain}`,
      orderId,
      status: 'created',
      srcChain,
      dstChain,
      secretHash,
      // Include deployed contract addresses for verification
      contracts: {
        base: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44', // LOP contract
        stellar: 'CAPWY2XT62L3A3VBPVS4IOHDQJDULCLR2QNZ5724PBOROLVKQXYH6ZZ7',
        sui: '0x04cf15bd22b901053411485b652914f92a2cb1c337e10e5a45a839e1c7ac3f8e'
      },
      timelock: {
        srcCancellation: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1 hour
        dstCancellation: (Math.floor(Date.now() / 1000) + 1800).toString()  // 30 minutes
      }
    };
    
    return NextResponse.json(swapResult);
  } catch (error) {
    console.error('Error creating demo swap:', error);
    return NextResponse.json(
      { error: 'Failed to create demo swap' },
      { status: 500 }
    );
  }
}