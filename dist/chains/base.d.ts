import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
/**
 * Base L2 adapter using 1inch Limit Order Protocol
 * Supports both Base mainnet and Base Sepolia testnet
 */
export declare class BaseAdapter extends ChainAdapter {
    private provider;
    private wallet?;
    private lopContract?;
    constructor(config: ChainConfig, privateKey?: string);
    createLimitOrder(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    fillLimitOrder(escrow: EscrowDetails, secret: string): Promise<string>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancelLimitOrder(escrow: EscrowDetails): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private isNativeToken;
    private buildMakerTraits;
    checkOrderStatus(orderHash: string, maker: string): Promise<{
        remaining: bigint;
        cancelled: boolean;
    }>;
}
