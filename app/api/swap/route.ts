import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { chainResolver } from '../../lib/chain-resolver';
import { swapStorage } from '../../lib/swap-storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { srcChain, dstChain, srcToken, dstToken, srcAmount, dstAmount, maker } = body;

    // Validate chains are supported and ready
    if (!chainResolver.isChainReady(srcChain) || !chainResolver.isChainReady(dstChain)) {
      return NextResponse.json(
        { error: `Chain not ready. Supported chains: ${chainResolver.getSupportedChains().filter(c => chainResolver.isChainReady(c)).join(', ')}` },
        { status: 400 }
      );
    }

    // Generate real HTLC parameters
    const orderId = '0x' + randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const secretHash = '0x' + createHash('sha256').update(secret, 'hex').digest('hex');
    
    const currentTime = Math.floor(Date.now() / 1000);
    
    const swapOrder = {
      orderId,
      maker: maker || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      makingAmount: srcAmount,
      takingAmount: dstAmount,
      makerAsset: srcToken,
      takerAsset: dstToken,
      srcChainId: srcChain,
      dstChainId: dstChain,
      secretHash,
      timelock: {
        srcCancellation: (currentTime + 3600).toString(), // 1 hour
        dstCancellation: (currentTime + 1800).toString()  // 30 minutes  
      },
      status: 'created',
      createdAt: new Date().toISOString()
    };

    // Store the swap details for later execution
    swapStorage.storeSwap({
      orderId: swapOrder.orderId,
      srcChain: swapOrder.srcChainId,
      dstChain: swapOrder.dstChainId,
      srcAmount: swapOrder.makingAmount,
      dstAmount: swapOrder.takingAmount,
      srcToken: swapOrder.makerAsset,
      dstToken: swapOrder.takerAsset,
      maker: swapOrder.maker,
      secretHash: swapOrder.secretHash,
      status: swapOrder.status,
      createdAt: swapOrder.createdAt
    });
    
    return NextResponse.json({
      orderId: swapOrder.orderId,
      status: swapOrder.status,
      secretHash: swapOrder.secretHash,
      timelock: swapOrder.timelock,
      message: `Swap order created for ${srcChain} → ${dstChain}`,
      contracts: chainResolver.getDeploymentStatus(),
      // Include swap details for UI display
      swapDetails: {
        srcChain: swapOrder.srcChainId,
        dstChain: swapOrder.dstChainId,
        srcAmount: swapOrder.makingAmount,
        dstAmount: swapOrder.takingAmount,
        srcToken: swapOrder.makerAsset,
        dstToken: swapOrder.takerAsset,
        maker: swapOrder.maker
      }
    });

  } catch (error) {
    console.error('Error creating swap:', error);
    return NextResponse.json(
      { error: 'Failed to create swap' },
      { status: 500 }
    );
  }
}