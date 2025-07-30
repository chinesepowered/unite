import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Return supported chains - these match our deployed contracts
    const chains = ['base', 'stellar', 'sui', 'monad', 'tron'];
    return NextResponse.json({ chains });
  } catch (error) {
    console.error('Error getting chains:', error);
    return NextResponse.json(
      { error: 'Failed to get supported chains' },
      { status: 500 }
    );
  }
}