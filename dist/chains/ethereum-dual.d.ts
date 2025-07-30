import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
/**
 * Dual-mode Ethereum adapter:
 * - Mainnet: Uses 1inch infrastructure (production-ready)
 * - Testnet: Uses simplified HTLC contract (demo/testing)
 */
export declare class EthereumAdapter extends ChainAdapter {
    private provider;
    private wallet?;
    private htlcContract?;
    private isMainnet;
    private useOneInch;
    constructor(config: ChainConfig, privateKey?: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    private deployOneInchEscrow;
    private withdrawOneInch;
    private cancelOneInch;
    private deploySimpleHTLCEscrow;
    private withdrawSimpleHTLC;
    private cancelSimpleHTLC;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private isNativeToken;
    private getEscrowImplementation;
    getMode(): string;
}
