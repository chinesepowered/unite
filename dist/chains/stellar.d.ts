import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
export declare class StellarAdapter extends ChainAdapter {
    private server;
    private keypair?;
    constructor(config: ChainConfig, secretKey?: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private getTokenCode;
    private createHashlockCondition;
}
