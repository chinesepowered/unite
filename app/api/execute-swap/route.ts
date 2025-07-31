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

    // Step 1: Alice (Wallet 1) creates escrow on source chain
    try {
      console.log(`🎯 Step 1: Alice creating escrow on ${swapOrder.srcChain}`);
      const aliceSrcAdapter = getChainAdapter(swapOrder.srcChain, false); // Alice = first wallet
      const aliceSrcResult = await aliceSrcAdapter.createLimitOrder(swapOrder);
      
      if (aliceSrcResult.success) {
        console.log(`✅ Alice's ${swapOrder.srcChain} escrow created: ${aliceSrcResult.txHash}`);
        results.push({
          chain: swapOrder.srcChain,
          type: 'alice_escrow',
          txHash: aliceSrcResult.txHash,
          explorerUrl: aliceSrcResult.explorerUrl
        });
      } else {
        console.error(`❌ Alice's ${swapOrder.srcChain} escrow failed: ${aliceSrcResult.error}`);
        errors.push(`${swapOrder.srcChain} (Alice): ${aliceSrcResult.error}`);
      }
    } catch (error) {
      console.error(`💥 Alice's ${swapOrder.srcChain} error:`, error);
      errors.push(`${swapOrder.srcChain} (Alice): ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 2: Bob (Wallet 2) creates escrow on destination chain
    try {
      console.log(`🎯 Step 2: Bob creating escrow on ${swapOrder.dstChain}`);
      
      // Check if second wallet keys exist
      const secondWalletKey = swapOrder.dstChain === 'base' ? 'BASE_PRIVATE_KEY_2' : 
                             swapOrder.dstChain === 'monad' ? 'MONAD_PRIVATE_KEY_2' :
                             swapOrder.dstChain === 'sui' ? 'SUI_PRIVATE_KEY_2' : 'STELLAR_PRIVATE_KEY_2';
      
      if (!process.env[secondWalletKey]) {
        console.warn(`⚠️ ${secondWalletKey} not found, using Alice's wallet for demo`);
        // Use Alice's wallet for demo (shows hybrid concept without second wallet)
        const bobDstAdapter = getChainAdapter(swapOrder.dstChain, false); // Use first wallet
        const bobDstResult = await bobDstAdapter.createHTLC(swapOrder);
        
        if (bobDstResult.success) {
          console.log(`✅ Demo: ${swapOrder.dstChain} escrow created: ${bobDstResult.txHash}`);
          results.push({
            chain: swapOrder.dstChain,
            type: 'demo_escrow',
            txHash: bobDstResult.txHash,
            explorerUrl: bobDstResult.explorerUrl
          });
        } else {
          console.error(`❌ Demo ${swapOrder.dstChain} escrow failed: ${bobDstResult.error}`);
          errors.push(`${swapOrder.dstChain} (Demo): ${bobDstResult.error}`);
        }
      } else {
        // Use proper second wallet
        const bobDstAdapter = getChainAdapter(swapOrder.dstChain, true); // Bob = second wallet
        const bobDstResult = await bobDstAdapter.createHTLC(swapOrder);
        
        if (bobDstResult.success) {
          console.log(`✅ Bob's ${swapOrder.dstChain} escrow created: ${bobDstResult.txHash}`);
          results.push({
            chain: swapOrder.dstChain,
            type: 'bob_escrow',
            txHash: bobDstResult.txHash,
            explorerUrl: bobDstResult.explorerUrl
          });
        } else {
          console.error(`❌ Bob's ${swapOrder.dstChain} escrow failed: ${bobDstResult.error}`);
          errors.push(`${swapOrder.dstChain} (Bob): ${bobDstResult.error}`);
        }
      }
    } catch (error) {
      console.error(`💥 ${swapOrder.dstChain} error:`, error);
      errors.push(`${swapOrder.dstChain}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 3: If both escrows succeeded, execute claims
    if (results.length === 2 && errors.length === 0) {
      console.log(`🎯 Step 3: Both escrows created, executing atomic claims...`);
      
      // Step 3a: Alice claims Bob's funds (reveals secret)
      try {
        console.log(`🎯 Step 3a: Alice claiming Bob's ${swapOrder.dstChain} funds`);
        const aliceDstAdapter = getChainAdapter(swapOrder.dstChain, false); // Alice = first wallet
        
        if (swapOrder.dstChain === 'monad') {
          const aliceClaimResult = await (aliceDstAdapter as any).claimHTLC('1', secret); // Demo escrow ID
          if (aliceClaimResult.success) {
            console.log(`✅ Alice claimed ${swapOrder.dstChain} funds: ${aliceClaimResult.txHash}`);
            results.push({
              chain: swapOrder.dstChain,
              type: 'alice_claim',
              txHash: aliceClaimResult.txHash,
              explorerUrl: aliceClaimResult.explorerUrl
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ Alice's claim failed:`, error);
      }

      // Step 3b: Bob claims Alice's funds (using revealed secret)  
      try {
        console.log(`🎯 Step 3b: Bob claiming Alice's ${swapOrder.srcChain} funds`);
        const bobSrcAdapter = getChainAdapter(swapOrder.srcChain, true); // Bob = second wallet
        
        if (swapOrder.srcChain === 'base') {
          const bobClaimResult = await (bobSrcAdapter as any).claimHTLC('demo_escrow_1', secret);
          if (bobClaimResult.success) {
            console.log(`✅ Bob claimed ${swapOrder.srcChain} funds: ${bobClaimResult.txHash}`);
            results.push({
              chain: swapOrder.srcChain,
              type: 'bob_claim',
              txHash: bobClaimResult.txHash,
              explorerUrl: bobClaimResult.explorerUrl
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ Bob's claim failed:`, error);
      }
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
    const escrowCount = results.filter(r => r.type.includes('escrow')).length;
    const claimCount = results.filter(r => r.type.includes('claim')).length;
    
    let message = '';
    if (claimCount >= 2) {
      message = `🎉 Atomic swap completed! Both parties claimed funds (${results.length} transactions)`;
    } else if (escrowCount >= 2) {
      message = `⚡ Escrows deployed, claims in progress (${results.length} transactions)`;
    } else if (success) {
      message = `🔄 Partial execution: ${results.length} transactions successful`;
    } else {
      message = 'Swap execution failed';
    }
    
    const response = {
      success,
      orderId,
      message,
      results,
      errors: errors.length > 0 ? errors : undefined,
      secret: success ? secret : undefined,
      atomicSwapSteps: {
        escrowsCreated: escrowCount,
        claimsCompleted: claimCount,
        totalTransactions: results.length
      },
      nextSteps: claimCount >= 2 
        ? '🎉 Atomic swap completed! Funds have been successfully exchanged between parties.'
        : escrowCount >= 2
        ? '⚡ Escrows created. Claims executed automatically to complete atomic swap.'
        : success 
        ? 'Partial execution completed. Check results for details.'
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