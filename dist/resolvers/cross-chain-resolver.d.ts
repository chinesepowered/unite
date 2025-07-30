import { SwapResult, SwapState } from '../core/types';
export declare class CrossChainResolver {
    private chains;
    private swapStates;
    constructor();
    private initializeChains;
    private loadDeployments;
    private buildChainConfigs;
    createSwap(srcChain: string, dstChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string): Promise<SwapState>;
    executeSwap(orderId: string): Promise<SwapResult>;
    cancelSwap(orderId: string): Promise<SwapResult>;
    getSwapState(orderId: string): SwapState | undefined;
    getAllSwaps(): SwapState[];
    getSupportedChains(): string[];
    getChainBalance(chain: string, address: string, tokenAddress: string): Promise<bigint>;
    private generateOrderId;
    private sleep;
    /**
     * Create a swap with partial fills support
     */
    createPartialSwap(srcChain: string, dstChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string, partCount?: number): Promise<SwapState>;
    /**
     * Execute partial swap fills
     */
    executePartialSwap(orderId: string, partIds?: string[]): Promise<SwapResult>;
    createBaseToChainSwap(dstChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string): Promise<SwapState>;
    createChainToBaseSwap(srcChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string): Promise<SwapState>;
    createEthToChainSwap(dstChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string): Promise<SwapState>;
    createChainToEthSwap(srcChain: string, srcToken: string, dstToken: string, srcAmount: bigint, dstAmount: bigint, maker: string): Promise<SwapState>;
}
