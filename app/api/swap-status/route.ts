import { NextRequest, NextResponse } from 'next/server';

// Access global storage set by swap creation
function getGlobalSwaps() {
  return (global as any).recentSwaps || new Map();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json({ error: 'orderId parameter required' }, { status: 400 });
    }
    
    console.log(`🔍 GET /api/swap-status?orderId=${orderId}`);
    
    // Check if we have stored data for this swap
    const globalSwaps = getGlobalSwaps();
    const storedSwap = globalSwaps.get(orderId);
    if (storedSwap) {
      console.log(`✅ Found stored swap data for ${orderId}`);
      return NextResponse.json(storedSwap);
    }
    
    console.log(`❌ No stored swap data found for ${orderId}`);
    
    // If not found but looks like valid orderId, return not found
    // (We only return data for swaps that were actually created and stored)
    
    // Invalid orderId format
    return NextResponse.json(
      { error: `Swap ${orderId} not found` },
      { status: 404 }
    );
  } catch (error) {
    console.error('❌ Error getting swap status:', error);
    return NextResponse.json(
      { error: 'Failed to get swap status' },
      { status: 500 }
    );
  }
}