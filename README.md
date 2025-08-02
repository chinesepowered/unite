# Fusion+ Multi-Chain Extension

A hackathon project extending 1inch Fusion+ cross-chain swaps to support 4 additional chains: **Monad**, **Tron**, **Sui**, and **Stellar**. This enables bidirectional atomic swaps between Ethereum and each of these chains using HTLC (Hashed Timelock Contracts).

## 🎯 Project Goal

Expand 1inch Cross-chain Swap (Fusion+) to enable swaps between Ethereum and the following chains:
- ⚡ **Monad** (EVM-compatible)
- 🌟 **Tron** (TVM)
- 🔵 **Sui** (Move-based)
- ✨ **Stellar** (Stellar Consensus Protocol)

## 🏗️ Architecture

```
Ethereum (1inch SDK) ↔ HTLC Resolver ↔ Target Chains
                           ↓
                    Custom Escrow Contracts
```

### Key Components

1. **Chain Adapters** - Interface implementations for each blockchain
2. **HTLC Escrow Contracts** - Smart contracts handling atomic swaps
3. **Cross-Chain Resolver** - Orchestrates swaps between chains
4. **REST API Server** - Provides endpoints for swap creation and execution

### HTLC Features
- ✅ **Hashlock** - Secret-based fund release
- ✅ **Timelock** - Automatic refund after expiry
- ✅ **Bidirectional** - ETH ↔ Chain swaps supported
- ✅ **Atomic** - All-or-nothing execution
- ✅ **Safety Deposits** - Economic security guarantees

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- Private keys for each chain (testnet recommended)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Configure your private keys and RPC URLs in .env
```

### Environment Setup

Edit `.env` with your configuration:

```bash
# Ethereum Sepolia Testnet
ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ETH_PRIVATE_KEY=0x... # Your Ethereum private key
ETH_ESCROW_FACTORY=0x7F3A34991C61963678676f4094596fAcbf7ea3f6 # 1inch factory

# Monad Testnet (EVM-compatible)
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_PRIVATE_KEY=0x... # Your Monad private key

# Stellar Testnet
STELLAR_RPC_URL=https://horizon-testnet.stellar.org
STELLAR_PRIVATE_KEY=S... # Stellar secret key format (starts with S)

# Sui Testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PRIVATE_KEY=0x... # Sui private key

# Tron Shasta Testnet
TRON_RPC_URL=https://api.shasta.trongrid.io
TRON_PRIVATE_KEY=0x... # Tron private key
```

## 🧪 Testnet Setup Guide

### Getting Testnet Tokens

#### 1. Ethereum Sepolia
- **Faucet**: https://faucets.chain.link/sepolia
- **Alternative**: https://sepolia-faucet.pk910.de/
- **Required**: ~0.1 ETH for testing swaps
- **1inch Integration**: Uses existing Sepolia deployment

#### 2. Monad Testnet
- **Faucet**: https://testnet-faucet.monad.xyz
- **Required**: ~10 MON for gas and testing
- **HTLC Contracts**: Need to deploy custom contracts
- **RPC**: May require waitlist access

#### 3. Stellar Testnet
- **Account Creation**: https://laboratory.stellar.org/#account-creator
- **Friendbot Faucet**: https://friendbot.stellar.org
- **Required**: 10,000 XLM (free from faucet)
- **Format**: Use Stellar Laboratory to generate keypairs

#### 4. Sui Testnet
- **Discord Faucet**: https://discord.gg/sui (request in #devnet-faucet)
- **CLI Faucet**: `sui client faucet` (after installing Sui CLI)
- **Required**: ~1 SUI for testing
- **Setup**: Install Sui CLI for key management

#### 5. Tron Shasta Testnet
- **Faucet**: https://www.trongrid.io/shasta
- **Required**: ~1000 TRX for testing
- **Energy**: May need additional energy for contract calls
- **Backup Faucet**: https://shasta.tronex.io/

### Account Setup Steps

```bash
# 1. Generate keys for each chain (or use existing)
# 2. Fund accounts with testnet tokens
# 3. Deploy HTLC contracts (for non-Ethereum chains)
pnpm deploy:contracts

# 4. Verify deployment
pnpm test:integration

# 5. Start development
pnpm dev
```

### Running the Application

```bash
# Development mode (runs both backend and frontend)
pnpm dev

# Backend only (API server)
pnpm dev:server

# Frontend only (Next.js UI)
pnpm dev:client

# Production build
pnpm build
pnpm start
```

- **Backend API**: `http://localhost:3000`
- **Frontend UI**: `http://localhost:3001`

## 📡 API Endpoints

### Core Endpoints

```bash
# Get supported chains
GET /api/chains

# Create a cross-chain swap
POST /api/swap
{
  "srcChain": "ethereum",
  "dstChain": "stellar", 
  "srcToken": "0x0000000000000000000000000000000000000000",
  "dstToken": "native",
  "srcAmount": "1000000000000000000",
  "dstAmount": "10000000",
  "maker": "0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e"
}

# Execute a swap (resolver action)
POST /api/swap/:orderId/execute

# Get swap status
GET /api/swap/:orderId

# Cancel a swap
POST /api/swap/:orderId/cancel
```

### Demo Endpoints

```bash
# Auto-executing demo swap
POST /api/demo/swap
{
  "srcChain": "ethereum",
  "dstChain": "stellar"
}

# Bidirectional convenience endpoints
POST /api/swap/eth-to-chain
POST /api/swap/chain-to-eth
```

## 🧪 Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run integration tests (requires testnet setup)
pnpm test:integration
```

## 🔧 Chain-Specific Implementation

### Ethereum
- Uses 1inch Cross-Chain SDK and EscrowFactory
- Native ERC20 and ETH support
- Integrates with existing Fusion+ infrastructure

### Monad (EVM-Compatible)
- Custom HTLC contract deployment
- Native MON and ERC20 token support
- Standard Ethereum tooling compatibility

### Stellar
- Native XLM and custom asset support
- Timebound transactions for HTLC
- Stellar Horizon API integration

### Sui
- Move-based escrow objects
- Native SUI and custom coin support
- Transaction block composition

### Tron
- TVM-compatible HTLC contracts
- Native TRX and TRC20 support
- TronWeb integration

## 🔒 Security Features

- **Atomic Execution** - Swap completes fully or reverts
- **Timelock Protection** - Automatic refunds prevent fund loss
- **Secret Verification** - Cryptographic proof required for withdrawal
- **Replay Protection** - Each swap uses unique order ID
- **Emergency Recovery** - Owner-controlled fallback after extended timeouts

## 🧩 Partial Fills Implementation

### Current Status
- ✅ **Ethereum**: Native support via 1inch Merkle tree architecture
- 🔶 **Other Chains**: All-or-nothing HTLCs (enhancement ready)

### Implementation Options

#### Option A: Multiple HTLCs (Simple)
```solidity
// Create multiple smaller HTLCs instead of one large order
createHTLCEscrow(secretHash1, amount1, timelock, receiver, orderId_1);
createHTLCEscrow(secretHash2, amount2, timelock, receiver, orderId_2);
// Each HTLC can be filled independently
```

#### Option B: Merkle Tree HTLCs (Advanced)
```solidity
struct PartialEscrow {
    uint256 totalAmount;
    uint256 remainingAmount;
    bytes32 merkleRoot;        // Root of secrets tree
    mapping(bytes32 => bool) usedSecrets;
}

function partialWithdraw(
    bytes32 escrowId,
    uint256 amount,
    bytes32 secret,
    bytes32[] calldata merkleProof
) external {
    // Verify secret is in Merkle tree
    // Verify amount doesn't exceed remaining
    // Transfer partial amount
}
```

### Implementation Complexity
- **Monad/Tron**: 🟡 Medium (EVM-compatible, can adapt 1inch patterns)
- **Stellar**: 🔴 Hard (Limited Merkle tree support, requires custom logic)
- **Sui**: 🟡 Medium (Move vectors can handle tree operations)

### Getting Started with Partial Fills
```bash
# 1. Start with Option A for quick implementation
# 2. Test with multiple small HTLCs
# 3. Upgrade to Merkle tree version for gas optimization

# Example: Split 1 ETH order into 4 x 0.25 ETH HTLCs
pnpm run create-partial-order --amount=1000000000000000000 --parts=4
```

## 📋 Swap Flow

1. **Create Order** - User specifies swap parameters
2. **Deploy Source Escrow** - Funds locked on source chain
3. **Deploy Destination Escrow** - Resolver deposits on destination
4. **Finality Wait** - Brief period for block confirmation
5. **Atomic Withdrawal** - User and resolver exchange funds using secret
6. **Completion** - Both parties receive their tokens

## 🎯 Hackathon Requirements

✅ **Preserve hashlock and timelock functionality** - Full HTLC implementation  
✅ **Bidirectional swaps** - ETH ↔ Chain pairs supported  
✅ **Onchain execution** - Smart contract-based escrows  
✅ **Testnet/Mainnet ready** - Configurable RPC endpoints  

### Stretch Goals
🔶 **Partial fills** - Architecture supports, implementation pending  
🔶 **Relayer/resolver** - Basic resolver implemented  
🔶 **UI** - Complete React UI with real-time tracking  

## 🛠️ Development

### Project Structure
```
src/
├── chains/          # Chain-specific adapters
├── core/           # Common types and interfaces  
├── resolvers/      # Cross-chain swap orchestration
├── server/         # REST API server
└── test/           # Test suites

contracts/
└── src/            # Solidity HTLC contracts
```

### Adding New Chains

1. Implement `ChainAdapter` interface
2. Add chain configuration
3. Deploy/configure escrow contracts
4. Update resolver initialization
5. Add integration tests

### Building Smart Contracts

```bash
# Install Foundry if not already installed
curl -L https://foundry.paradigm.xyz | bash
forge install

# Compile contracts
pnpm forge:build

# Run contract tests
pnpm forge:test

# Deploy contracts to testnets
pnpm deploy:contracts
```

## 🔧 Troubleshooting

### Common Issues

#### 1. RPC Connection Errors
```bash
# Check if RPC endpoints are accessible
curl -X POST https://sepolia.infura.io/v3/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

#### 2. Insufficient Testnet Funds
- Ensure all accounts have sufficient native tokens for gas
- Check token balances match the swap amounts
- Use multiple faucets if daily limits are exceeded

#### 3. Contract Deployment Issues
```bash
# Check if contracts are properly deployed
pnpm check-deployments

# Manually deploy specific chain
pnpm deploy:contracts --chain=monad
```

#### 4. Swap Execution Failures
- Verify secret hash matches across chains
- Check timelock hasn't expired
- Ensure proper token approvals for ERC20 swaps

#### 5. HTLC Test Failures
```bash
# Run comprehensive HTLC compliance tests
pnpm forge:test --match-test "HTLC*"

# Check specific security features
pnpm forge:test --match-test "testHashlock*"
pnpm forge:test --match-test "testTimelock*"
```

### Quick Verification
```bash
# Health check all components
curl http://localhost:3000/health
curl http://localhost:3000/api/chains

# Test demo swap
curl -X POST http://localhost:3000/api/demo/swap \
  -H "Content-Type: application/json" \
  -d '{"srcChain":"ethereum","dstChain":"stellar"}'
```

## 🏆 Demo

The project includes both a **Web UI** and **API** for fully functional demos:

### Live Demo Page

```bash
# Start the application
pnpm dev

# Open browser to http://localhost:3000/demo  
# - 8 pre-configured swap pairs
# - One-click execution with real blockchain transactions
# - Live transaction results with explorer links
# - Perfect for hackathon video demos
```

**Featured Demo Swaps:**
1. 🔵⚡ Base Sepolia → Monad Testnet (0.001 ETH → 0.001 MON)
2. ⚡🔵 Monad Testnet → Base Sepolia (0.001 MON → 0.001 ETH)  
3. 🔵🌊 Base Sepolia → Sui Testnet (0.001 ETH → 0.001 SUI)
4. 🌊🔵 Sui Testnet → Base Sepolia (0.001 SUI → 0.001 ETH)
5. 🔵⭐ Base Sepolia → Stellar Testnet (0.001 ETH → 0.001 XLM)
6. ⭐🔵 Stellar Testnet → Base Sepolia (0.001 XLM → 0.001 ETH)
7. 🔵🔴 Base Sepolia → Tron Shasta (0.001 ETH → 0.001 TRX)
8. 🔴🔵 Tron Shasta → Base Sepolia (0.001 TRX → 0.001 ETH)

### Web Interface Demo

```bash
# Start both backend and frontend
pnpm dev

# Open browser to http://localhost:3000
# - Interactive chain selection
# - Real-time swap status tracking  
# - Complete swap history
```

### API Demo

```bash
# Start the backend server
pnpm dev:server

# Create and auto-execute a demo swap
curl -X POST http://localhost:3000/api/demo/swap \
  -H "Content-Type: application/json" \
  -d '{
    "srcChain": "ethereum",
    "dstChain": "stellar",
    "srcAmount": "1000000000000000000",
    "dstAmount": "10000000"
  }'
```

### Demo Features

**🚀 Live Demo Page (`/demo`):**
- ✨ **Sleek Modern UI** - Dark gradient design with glassmorphism effects  
- ⚡ **One-Click Execution** - 8 pre-configured swap pairs ready to run
- 🎯 **Real-Time Results** - Live transaction tracking with explorer links
- 📊 **Visual Status** - Color-coded success/failure indicators
- 🔗 **Direct Explorer Links** - Click to view transactions on block explorers
- 📱 **Responsive Design** - Perfect for demo videos and presentations

**💼 Interactive Form (`/`):**
- 🔄 **Real-time Updates** - Live swap status tracking
- 📊 **Swap History** - Complete transaction history with details
- 🎨 **Chain Visualization** - Color-coded chain selection
- 📱 **Responsive Design** - Works on desktop and mobile

The demo showcases:
- **4-Transaction Atomic Swaps** - Complete HTLC execution flow
- **Multi-chain Escrow Deployment** - Real contracts on testnets
- **HTLC Secret/Hash Mechanism** - Cryptographic proof system
- **Explorer Integration** - Direct links to view all transactions
- **Error Recovery** - Graceful handling of partial executions

## 📄 License

MIT License - Built for 1inch Hackathon

## 🤝 Contributing

This is a hackathon project. For production use, additional testing, security audits, and optimizations would be required.

---

**Note**: This implementation provides the core framework for multi-chain Fusion+ swaps. For production deployment, additional considerations around gas optimization, MEV protection, and formal security audits would be necessary.
