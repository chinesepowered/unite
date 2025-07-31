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
      maker: maker || '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
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

    // Store for status endpoint in global (since we can't use imports that hang)
    (global as any).recentSwaps = (global as any).recentSwaps || new Map();
    (global as any).recentSwaps.set(swapOrder.orderId, {
      orderId: swapOrder.orderId,
      status: swapOrder.status,
      srcChain: swapOrder.srcChainId,
      dstChain: swapOrder.dstChainId,
      makingAmount: swapOrder.makingAmount,    // REAL form amounts
      takingAmount: swapOrder.takingAmount,    // REAL form amounts
      makerAsset: swapOrder.makerAsset,
      takerAsset: swapOrder.takerAsset,
      maker: swapOrder.maker,
      secretHash: swapOrder.secretHash,
      createdAt: swapOrder.createdAt,
      updatedAt: swapOrder.createdAt,
      contracts: {
        srcContract: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44',
        dstContract: '0x0A027767aC1e4aA5474A1B98C3eF730C3994E67b'
      },
      timelock: {
        srcCancellation: swapOrder.timelock.srcCancellation,
        dstCancellation: swapOrder.timelock.dstCancellation
      }
    });
    
    console.log(`📝 Stored swap data for status endpoint: ${swapOrder.orderId}`);
    
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