import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
/**
 * Working Ethereum/Monad adapter using deployed HTLC contracts
 */
export declare class WorkingEthereumAdapter extends ChainAdapter {
    private provider;
    private wallet?;
    private htlcContract?;
    constructor(config: ChainConfig, privateKey?: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private isNativeToken;
}
/**
 * Demo adapter for non-EVM chains - simulates HTLC behavior
 * In production, these would call actual chain-specific HTLC contracts
 */
export declare class DemoChainAdapter extends ChainAdapter {
    private chainId;
    private mockEscrows;
    constructor(config: ChainConfig, chainId: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
}
