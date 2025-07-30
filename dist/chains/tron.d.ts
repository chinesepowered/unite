import { ChainAdapter, ChainConfig, SwapOrder, EscrowDetails } from '../core/types';
export declare class TronAdapter extends ChainAdapter {
    private tronWeb;
    private account?;
    constructor(config: ChainConfig, privateKey?: string);
    deployEscrow(order: SwapOrder, side: 'src' | 'dst'): Promise<EscrowDetails>;
    withdraw(escrow: EscrowDetails, secret: string): Promise<string>;
    cancel(escrow: EscrowDetails): Promise<string>;
    getBalance(address: string, tokenAddress: string): Promise<bigint>;
    getBlockTimestamp(): Promise<bigint>;
    isChainSupported(): boolean;
    private isTRX;
    private getOrDeployEscrowContract;
    private extractEscrowIdFromReceipt;
    private getEscrowContractSource;
}
