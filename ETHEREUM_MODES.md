# Ethereum Integration Modes

This project supports **dual-mode Ethereum integration** to meet both production and demo requirements:

## 🏭 Production Mode (Mainnet + 1inch)
**When:** Mainnet deployment (Chain ID: 1)  
**Uses:** 1inch's deployed EscrowFactory and resolver infrastructure  
**Benefits:** Production-ready, battle-tested, full 1inch ecosystem integration

```typescript
// Automatically enabled on mainnet
const config = {
  ethereum: {
    chainId: '1', // Mainnet - automatically uses 1inch
    rpcUrl: 'https://eth.merkle.io',
    escrowFactory: '0x1inch_deployed_factory_address'
  }
}
```

## 🧪 Demo Mode (Testnet + Simple HTLC)
**When:** Testnet deployment (Sepolia, etc.)  
**Uses:** Our simplified HTLC contract (same pattern as other chains)  
**Benefits:** No 1inch testnet dependencies, consistent cross-chain demo

```typescript
// Automatically enabled on testnet
const config = {
  ethereum: {
    chainId: '11155111', // Sepolia - automatically uses simple HTLC
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
    escrowFactory: '0x_your_deployed_htlc_contract'
  }
}
```

## 🔧 Force Simple HTLC (Override)
To use simple HTLC even on mainnet (for testing):

```bash
export FORCE_SIMPLE_HTLC=true
```

## 📋 Architecture Comparison

| Feature | 1inch Mode (Mainnet) | Simple HTLC Mode (Testnet) |
|---------|----------------------|---------------------------|
| **Contracts** | 1inch EscrowFactory | Our HTLCEscrow.sol |
| **Security** | Production-tested | OpenZeppelin + Custom |
| **Features** | Full 1inch ecosystem | Core HTLC functionality |
| **Deployment** | Pre-deployed | Deploy via Remix |
| **Networks** | Mainnet only | Any EVM testnet |

## 🚀 Deployment Instructions

### Mainnet (1inch Mode)
1. Use 1inch's deployed factory addresses
2. No contract deployment needed
3. Configure resolver with 1inch infrastructure

### Testnet (Simple HTLC Mode)
1. Deploy `contracts/ethereum/HTLCEscrow.sol` via Remix
2. Update config with deployed address
3. Consistent with other chain deployments

## 🔍 Runtime Detection

The adapter automatically logs which mode it's using:

```
🔗 Ethereum adapter initialized: 1inch (mainnet)
🔗 Ethereum adapter initialized: Simple HTLC (testnet)
```

You can also check programmatically:
```typescript
const ethereumAdapter = new EthereumAdapter(config);
console.log(ethereumAdapter.getMode()); // "1inch-mainnet" or "simple-htlc-testnet"
```

## ✅ Benefits of This Approach

1. **Meets Requirements**: Ethereum uses 1inch on mainnet as specified
2. **Demo Ready**: Works on testnets without 1inch dependencies  
3. **Consistent**: Same HTLC pattern across all chains in demo mode
4. **Future Proof**: Easy to switch between modes based on environment
5. **Hackathon Friendly**: Judges can see working demo immediately

This dual approach preserves the original architecture vision while ensuring a fully functional demo for the hackathon.