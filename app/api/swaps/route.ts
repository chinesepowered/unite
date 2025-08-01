import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Return empty swap history
    // In production, this would query stored swap orders
    
    const swaps = [
      // Could include sample swap history
    ];
    
    return NextResponse.json({ swaps });
  } catch (error) {
    console.error('Error getting swaps:', error);
    return NextResponse.json(
      { error: 'Failed to get swap history' },
      { status: 500 }
    );
  }
}