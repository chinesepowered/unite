import { NextRequest, NextResponse } from 'next/server';
import { chainResolver } from '../../../../lib/chain-resolver';
import { getChainAdapter } from '../../../../lib/real-chain-adapters';
import { swapStorage } from '../../../../lib/swap-storage';
import { randomBytes, createHash } from 'crypto';

interface RouteParams {
  params: {
    orderId: string;
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orderId } = params;
    
    console.log(`🚀 Executing REAL cross-chain swap: ${orderId}`);
    
    // Retrieve the stored swap details
    const storedSwap = swapStorage.getSwap(orderId);
    if (!storedSwap) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Swap ${orderId} not found`,
          hint: 'Make sure to create the swap first'
        },
        { status: 404 }
      );
    }
    
    console.log(`📋 Retrieved swap: ${storedSwap.srcAmount} ${storedSwap.srcChain} → ${storedSwap.dstAmount} ${storedSwap.dstChain}`);
    
    const swapOrder = {
      orderId: storedSwap.orderId,
      srcChain: storedSwap.srcChain,
      dstChain: storedSwap.dstChain,
      srcAmount: storedSwap.srcAmount,
      dstAmount: storedSwap.dstAmount,
      srcToken: storedSwap.srcToken,
      dstToken: storedSwap.dstToken,
      maker: storedSwap.maker,
      secretHash: storedSwap.secretHash,
      secret: randomBytes(32).toString('hex') // Generate execution secret
    };
    
    const deploymentStatus = chainResolver.getDeploymentStatus();
    
    // Check if required chains have deployed contracts
    if (deploymentStatus.base.status !== 'deployed' || deploymentStatus.stellar.status !== 'deployed') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Required contracts not deployed',
          deploymentStatus 
        },
        { status: 400 }
      );
    }
    
    console.log('📝 Step 1: Creating Base LOP order...');
    
    // Execute REAL blockchain transactions
    try {
      const baseAdapter = getChainAdapter('base');
      const stellarAdapter = getChainAdapter('stellar');
      
      // Step 1: Create Base side transaction
      const baseResult = await baseAdapter.createLimitOrder(swapOrder);
      if (!baseResult.success) {
        throw new Error(`Base transaction failed: ${baseResult.error}`);
      }
      
      console.log(`✅ Base transaction: ${baseResult.txHash}`);
      console.log('📝 Step 2: Creating Stellar HTLC...');
      
      // Step 2: Create Stellar side transaction  
      const stellarResult = await stellarAdapter.createHTLC(swapOrder);
      if (!stellarResult.success) {
        throw new Error(`Stellar transaction failed: ${stellarResult.error}`);
      }
      
      console.log(`✅ Stellar transaction: ${stellarResult.txHash}`);
      console.log('🎉 Cross-chain swap completed successfully!');
      
      const executionResult = {
        success: true,
        message: 'REAL cross-chain swap executed successfully!',
        orderId,
        realTransactions: true,
        txHashes: {
          baseTx: baseResult.txHash,
          stellarTx: stellarResult.txHash
        },
        explorerLinks: {
          base: baseResult.explorerUrl,
          stellar: stellarResult.explorerUrl
        },
        contracts: {
          baseLOP: deploymentStatus.base.contract,
          stellarHTLC: deploymentStatus.stellar.contract
        },
        swapDetails: {
          srcChain: swapOrder.srcChain,
          dstChain: swapOrder.dstChain,
          srcAmount: swapOrder.srcAmount + ' ETH',
          dstAmount: swapOrder.dstAmount + ' XLM'
        },
        completedAt: new Date().toISOString()
      };
      
      return NextResponse.json(executionResult);
      
    } catch (adapterError) {
      console.error('❌ Blockchain adapter error:', adapterError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Blockchain transaction failed',
          details: adapterError instanceof Error ? adapterError.message : String(adapterError),
          hint: 'Check if wallet private keys are set in .env'
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('❌ Error executing swap:', error);
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