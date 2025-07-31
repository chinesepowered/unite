import { NextRequest, NextResponse } from 'next/server';
import { getChainAdapter } from '../../lib/real-chain-adapters';
import { randomBytes, createHash } from 'crypto';

// Access global storage set by swap creation (avoiding hanging imports)
function getGlobalSwaps() {
  return (global as any).recentSwaps || new Map();
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json({ error: 'orderId parameter required' }, { status: 400 });
    }
    
    console.log(`🚀 Executing REAL cross-chain swap: ${orderId}`);
    
    // Retrieve the stored swap details from global storage
    const globalSwaps = getGlobalSwaps();
    const storedSwap = globalSwaps.get(orderId);
    if (!storedSwap) {
      console.log(`❌ Swap ${orderId} not found in global storage`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Swap ${orderId} not found`,
          hint: 'Make sure to create the swap first'
        },
        { status: 404 }
      );
    }

    console.log(`📋 Found stored swap: ${storedSwap.srcChain} → ${storedSwap.dstChain}`);
    
    // Generate secret for HTLC (in production, this would be managed securely)
    const secret = randomBytes(32).toString('hex');
    const secretHash = '0x' + createHash('sha256').update(secret, 'hex').digest('hex');
    
    // Create swap order structure for chain adapters
    const swapOrder = {
      orderId: storedSwap.orderId,
      srcChain: storedSwap.srcChain,
      dstChain: storedSwap.dstChain,
      srcAmount: storedSwap.makingAmount,    // Use the correct field names from global storage
      dstAmount: storedSwap.takingAmount,    // Use the correct field names from global storage
      srcToken: storedSwap.makerAsset,
      dstToken: storedSwap.takerAsset,
      maker: storedSwap.maker,
      secretHash: storedSwap.secretHash,
      secret: secret
    };

    console.log(`💰 Swap details: ${swapOrder.srcAmount} ${swapOrder.srcChain} → ${swapOrder.dstAmount} ${swapOrder.dstChain}`);

    const results = [];
    const errors = [];

    try {
      // Execute source chain transaction (Base with 1inch LOP)
      console.log(`🎯 Executing source chain: ${swapOrder.srcChain}`);
      const srcAdapter = getChainAdapter(swapOrder.srcChain);
      const srcResult = await srcAdapter.createLimitOrder(swapOrder);
      
      if (srcResult.success) {
        console.log(`✅ Source chain success: ${srcResult.txHash}`);
        results.push({
          chain: swapOrder.srcChain,
          type: 'source',
          txHash: srcResult.txHash,
          explorerUrl: srcResult.explorerUrl
        });
      } else {
        console.error(`❌ Source chain failed: ${srcResult.error}`);
        errors.push(`${swapOrder.srcChain}: ${srcResult.error}`);
      }
    } catch (error) {
      console.error(`💥 Source chain error:`, error);
      errors.push(`${swapOrder.srcChain}: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      // Execute destination chain transaction (Monad with HTLC)
      console.log(`🎯 Executing destination chain: ${swapOrder.dstChain}`);
      const dstAdapter = getChainAdapter(swapOrder.dstChain);
      const dstResult = await dstAdapter.createHTLC(swapOrder);
      
      if (dstResult.success) {
        console.log(`✅ Destination chain success: ${dstResult.txHash}`);
        results.push({
          chain: swapOrder.dstChain,
          type: 'destination',
          txHash: dstResult.txHash,
          explorerUrl: dstResult.explorerUrl
        });
      } else {
        console.error(`❌ Destination chain failed: ${dstResult.error}`);
        errors.push(`${swapOrder.dstChain}: ${dstResult.error}`);
      }
    } catch (error) {
      console.error(`💥 Destination chain error:`, error);
      errors.push(`${swapOrder.dstChain}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Update swap status in global storage
    if (results.length > 0 && errors.length === 0) {
      // Both chains succeeded
      storedSwap.status = 'completed';
      globalSwaps.set(orderId, storedSwap);
      console.log(`🎉 Swap ${orderId} completed successfully!`);
    } else if (results.length > 0) {
      // Partial success
      storedSwap.status = results.length === 1 ? 'src_deployed' : 'dst_deployed';
      globalSwaps.set(orderId, storedSwap);
      console.log(`⚠️ Swap ${orderId} partially completed`);
    } else {
      // Complete failure
      storedSwap.status = 'failed';
      globalSwaps.set(orderId, storedSwap);
      console.log(`💀 Swap ${orderId} failed completely`);
    }

    const success = results.length > 0;
    const response = {
      success,
      orderId,
      message: success 
        ? `Cross-chain swap executed: ${results.length}/${results.length + errors.length} chains successful`
        : 'Swap execution failed',
      results,
      errors: errors.length > 0 ? errors : undefined,
      secret: success ? secret : undefined, // Return secret for claim operations
      nextSteps: success 
        ? 'Swap escrows deployed. Users can now claim funds using the secret.'
        : 'Check errors and retry transaction.'
    };

    console.log(`📊 Final result:`, { success, resultsCount: results.length, errorsCount: errors.length });
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('💥 Execute swap error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to execute swap',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}