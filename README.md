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
# Ethereum
ETH_RPC_URL=https://eth.merkle.io
ETH_PRIVATE_KEY=0x...

# Monad (EVM-compatible)
MONAD_RPC_URL=https://monad-testnet-rpc.com
MONAD_PRIVATE_KEY=0x...

# Stellar
STELLAR_RPC_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=S...

# Sui
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PRIVATE_KEY=suiprivkey...

# Tron
TRON_RPC_URL=https://api.shasta.trongrid.io
TRON_PRIVATE_KEY=0x...
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
  "maker": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
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
🔶 **UI** - REST API ready for frontend integration  

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
forge build

# Run contract tests
forge test
```

## 🏆 Demo

The project includes both a **Web UI** and **API** for fully functional demos:

### Web Interface Demo

```bash
# Start both backend and frontend
pnpm dev

# Open browser to http://localhost:3001
# - Interactive chain selection
# - Real-time swap status tracking  
# - One-click demo swaps
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

- ✨ **Interactive UI** - Modern React interface with Tailwind CSS
- 🔄 **Real-time Updates** - Live swap status tracking
- 🎯 **One-click Demo** - Instant cross-chain swap creation
- 📊 **Swap History** - Complete transaction history with details
- 🎨 **Chain Visualization** - Color-coded chain selection
- 📱 **Responsive Design** - Works on desktop and mobile

The demo showcases:
- Multi-chain escrow deployment
- HTLC secret/hash mechanism  
- Atomic swap execution
- Proper timelock handling
- Error recovery capabilities

## 📄 License

MIT License - Built for 1inch Hackathon

## 🤝 Contributing

This is a hackathon project. For production use, additional testing, security audits, and optimizations would be required.

---

**Note**: This implementation provides the core framework for multi-chain Fusion+ swaps. For production deployment, additional considerations around gas optimization, MEV protection, and formal security audits would be necessary.
