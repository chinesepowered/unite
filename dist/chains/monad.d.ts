import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
export declare class MonadAdapter extends ChainAdapter {
    private provider;
    private wallet?;
    constructor(config: ChainConfig, privateKey?: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private isNativeToken;
    private getOrDeployEscrowContract;
    private extractEscrowIdFromLogs;
    private getEscrowABI;
    private getEscrowBytecode;
}
