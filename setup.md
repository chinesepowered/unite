# Deployment Setup Guide

This guide covers how to build and deploy contracts for all supported chains.

## Prerequisites
- Node.js and pnpm installed
- Foundry (for Ethereum/Monad contracts)
- Stellar CLI with testnet account "hackathon" configured
- Sui CLI installed

## 1. Ethereum Contracts

### Build
```bash
cd contracts/ethereum
forge build
```

### Deploy to Testnet
```bash
# Deploy HTLCEscrow contract
forge create HTLCEscrow --rpc-url https://sepolia.infura.io/v3/YOUR_API_KEY --private-key YOUR_PRIVATE_KEY

# Or use Remix IDE at https://remix.ethereum.org
# 1. Upload HTLCEscrow.sol
# 2. Compile with Solidity 0.8.19
# 3. Deploy to Injected Web3 (MetaMask)
```

## 2. Monad Contracts

### Build
```bash
cd contracts/monad
forge build
```

### Deploy
```bash
# Use Remix IDE for deployment (same as Ethereum)
# Monad uses EVM-compatible tooling
forge create HTLCEscrow --rpc-url MONAD_RPC_URL --private-key YOUR_PRIVATE_KEY
```

## 3. Stellar Contracts

### Build
```bash
cd contracts/stellar
stellar contract build
```

### Deploy to Testnet
```bash
stellar contract deploy \  
  --wasm target/wasm32v1-none/release/htlc_escrow.wasm \
  --source hackathon \
  --rpc-url https://soroban-testnet.stellar.org:443 \
  --network-passphrase "Test SDF Network ; September 2015"

# Alternative: Direct deploy (may cause 405 error)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/htlc_escrow.wasm \
  --source hackathon \
  --network testnet \
  --network-passphrase "Test SDF Network ; September 2015"
```

## 4. Sui Contracts

### Build
```bash
cd contracts/sui
sui move build
```

### Deploy to Testnet
```bash
# Publish the package
sui client publish --gas-budget 20000000

# Or specify network explicitly
sui client publish --gas-budget 20000000 --network testnet
```

## 5. Tron Contracts

### Build
```bash
# Tron uses Solidity - can be compiled with tronbox or directly
cd contracts/tron
# Manual compilation or use TronIDE
```

### Deploy
```bash
# Use TronLink wallet with TronIDE at https://developers.tron.network/ide
# Or use tronbox if configured:
# tronbox migrate --network testnet
```

## 6. Update Configuration

After deployment, update the contract addresses in:
```bash
# Edit deployments.json with actual contract addresses
vim deployments.json
```

Example deployments.json structure:
```json
{
  "testnet": {
    "ethereum": {
      "htlcEscrow": "0x123...",
      "chainId": "11155111"
    },
    "stellar": {
      "htlcEscrow": "C123...",
      "networkPassphrase": "Test SDF Network ; September 2015"
    },
    "sui": {
      "packageId": "0x456...",
      "network": "testnet"
    }
  }
}
```

## Common Issues

### Stellar
- **Missing network passphrase**: Add `--network-passphrase "Test SDF Network ; September 2015"`
- **Wrong WASM path**: Check if it's `target/wasm32v1/release/` or `target/wasm32-unknown-unknown/release/`

### Sui
- **Insufficient gas**: Increase `--gas-budget` value
- **Network not configured**: Run `sui client envs` to check available networks

### Ethereum/Monad
- **Compilation errors**: Ensure Solidity version 0.8.19
- **Stack too deep**: Use `--via-ir` flag or optimize code structure

## Testing Deployment

Run the test suite after updating deployments.json:
```bash
pnpm test
```

Start the development server:
```bash
pnpm dev
```