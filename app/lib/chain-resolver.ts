// Simplified chain resolver for Next.js API routes
// Uses real contract addresses and RPC endpoints

interface ChainConfig {
  chainId: string;
  rpcUrl: string;
  contractAddress?: string;
  explorer: string;
}

interface DeployedContracts {
  base: {
    lopContract: string;
    chainId: string;
    rpcUrl: string;
    explorer: string;
  };
  stellar: {
    contractId: string;
    rpcUrl: string;
    explorer: string;
  };
  sui: {
    packageId: string;
    rpcUrl: string;
    explorer: string;
  };
  monad: {
    rpcUrl: string;
    explorer: string;
  };
  tron: {
    rpcUrl: string;
    explorer: string;
  };
}

export const DEPLOYED_CONTRACTS: DeployedContracts = {
  base: {
    lopContract: '0xE53136D9De56672e8D2665C98653AC7b8A60Dc44',
    chainId: '84532', // Base Sepolia
    rpcUrl: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org'
  },
  stellar: {
    contractId: 'CAPWY2XT62L3A3VBPVS4IOHDQJDULCLR2QNZ5724PBOROLVKQXYH6ZZ7',
    rpcUrl: 'https://soroban-testnet.stellar.org:443',
    explorer: 'https://stellar.expert/explorer/testnet'
  },
  sui: {
    packageId: '0x04cf15bd22b901053411485b652914f92a2cb1c337e10e5a45a839e1c7ac3f8e',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    explorer: 'https://testnet.suivision.xyz'
  },
  monad: {
    rpcUrl: 'https://testnet1.monad.xyz',
    explorer: 'https://testnet.monad.xyz'
  },
  tron: {
    rpcUrl: 'https://api.shasta.trongrid.io',
    explorer: 'https://shasta.tronscan.org'
  }
};

export class SimplifiedChainResolver {
  getSupportedChains(): string[] {
    return Object.keys(DEPLOYED_CONTRACTS);
  }

  getChainConfig(chainId: string): ChainConfig | null {
    const contract = DEPLOYED_CONTRACTS[chainId as keyof DeployedContracts];
    if (!contract) return null;

    return {
      chainId: chainId,
      rpcUrl: contract.rpcUrl,
      contractAddress: 'contractId' in contract ? contract.contractId :
                     'lopContract' in contract ? contract.lopContract :
                     'packageId' in contract ? contract.packageId : undefined,
      explorer: contract.explorer
    };
  }

  // Check if a chain has deployed contracts
  isChainReady(chainId: string): boolean {
    const config = this.getChainConfig(chainId);
    if (!config) return false;
    
    // Base, Stellar, and Sui have deployed contracts
    return ['base', 'stellar', 'sui'].includes(chainId);
  }

  // Get deployment status for all chains
  getDeploymentStatus() {
    return {
      base: {
        status: 'deployed',
        contract: DEPLOYED_CONTRACTS.base.lopContract,
        type: '1inch LOP'
      },
      stellar: {
        status: 'deployed', 
        contract: DEPLOYED_CONTRACTS.stellar.contractId,
        type: 'HTLC Soroban'
      },
      sui: {
        status: 'deployed',
        contract: DEPLOYED_CONTRACTS.sui.packageId,
        type: 'HTLC Move'
      },
      monad: {
        status: 'pending',
        contract: null,
        type: 'HTLC EVM'
      },
      tron: {
        status: 'pending',
        contract: null,
        type: 'HTLC TVM'
      }
    };
  }
}

export const chainResolver = new SimplifiedChainResolver();