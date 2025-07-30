// Simple in-memory storage for swap details
// In production, this would be a database

interface StoredSwap {
  orderId: string;
  srcChain: string;
  dstChain: string;
  srcAmount: string;
  dstAmount: string;
  srcToken: string;
  dstToken: string;
  maker: string;
  secretHash: string;
  status: string;
  createdAt: string;
}

class SwapStorage {
  private swaps: Map<string, StoredSwap> = new Map();

  storeSwap(swap: StoredSwap): void {
    this.swaps.set(swap.orderId, swap);
    console.log(`📝 Stored swap ${swap.orderId}: ${swap.srcAmount} ${swap.srcChain} → ${swap.dstAmount} ${swap.dstChain}`);
  }

  getSwap(orderId: string): StoredSwap | null {
    return this.swaps.get(orderId) || null;
  }

  updateSwapStatus(orderId: string, status: string): void {
    const swap = this.swaps.get(orderId);
    if (swap) {
      swap.status = status;
      this.swaps.set(orderId, swap);
    }
  }

  getAllSwaps(): StoredSwap[] {
    return Array.from(this.swaps.values());
  }
}

// Singleton instance
export const swapStorage = new SwapStorage();