import { NextRequest, NextResponse } from 'next/server';
import { swapStorage } from '../../../lib/swap-storage';
import { chainResolver } from '../../../lib/chain-resolver';

interface RouteParams {
  params: {
    orderId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { orderId } = params;
    
    // Get the actual stored swap data
    const storedSwap = swapStorage.getSwap(orderId);
    if (!storedSwap) {
      return NextResponse.json(
        { error: `Swap ${orderId} not found` },
        { status: 404 }
      );
    }
    
    // Get contract addresses for the chains
    const deploymentStatus = chainResolver.getDeploymentStatus();
    const srcContract = deploymentStatus[storedSwap.srcChain]?.contract;
    const dstContract = deploymentStatus[storedSwap.dstChain]?.contract;
    
    const swapOrder = {
      orderId: storedSwap.orderId,
      status: storedSwap.status,
      srcChain: storedSwap.srcChain,
      dstChain: storedSwap.dstChain,
      makingAmount: storedSwap.srcAmount,
      takingAmount: storedSwap.dstAmount,
      makerAsset: storedSwap.srcToken,
      takerAsset: storedSwap.dstToken,
      maker: storedSwap.maker,
      secretHash: storedSwap.secretHash,
      createdAt: storedSwap.createdAt,
      updatedAt: storedSwap.createdAt, // For now, same as created
      // Include contract information
      contracts: {
        srcContract: srcContract || 'pending',
        dstContract: dstContract || 'pending'
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