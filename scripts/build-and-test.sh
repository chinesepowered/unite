#!/bin/bash

echo "🏗️  Building and testing Fusion+ Multi-Chain contracts..."

# Check if forge is available
if ! command -v forge &> /dev/null; then
    echo "❌ Foundry not found. Please install Foundry first:"
    echo "   curl -L https://foundry.paradigm.xyz | bash"
    echo "   foundryup"
    exit 1
fi

# Build contracts
echo "🔨 Building Solidity contracts..."
cd contracts
forge build

if [ $? -ne 0 ]; then
    echo "❌ Contract build failed"
    exit 1
fi

echo "✅ Contracts built successfully"

# Check if contracts were compiled
if [ ! -f "out/HTLCEscrow.sol/HTLCEscrow.json" ]; then
    echo "❌ HTLCEscrow contract not found in build output"
    exit 1
fi

echo "📋 Contract artifacts:"
ls -la out/HTLCEscrow.sol/

cd ..

# Install Node.js dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    pnpm install
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
pnpm build:server

if [ $? -ne 0 ]; then
    echo "❌ TypeScript build failed"
    exit 1
fi

echo "✅ TypeScript built successfully"

# Create deployment configuration
echo "📝 Creating deployment configuration..."
cat > deployments.json << EOF
{
  "htlc": {
    "ethereum": "",
    "monad": "",
    "stellar": "",
    "sui": "",
    "tron": ""
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "note": "Contract deployment addresses - update after deployment"
}
EOF

echo "✅ Deployment configuration created"

# Test contract compilation and interfaces
echo "🧪 Testing contract interfaces..."
node -e "
const fs = require('fs');
const path = require('path');

// Check if HTLC contract artifact exists and has required functions
const contractPath = path.join(process.cwd(), 'contracts/out/HTLCEscrow.sol/HTLCEscrow.json');
if (!fs.existsSync(contractPath)) {
  console.error('❌ Contract artifact not found');
  process.exit(1);
}

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const abi = contract.abi;

const requiredFunctions = [
  'createHTLCEscrowNative',
  'createHTLCEscrowERC20', 
  'withdraw',
  'cancel',
  'getEscrowByOrderId',
  'verifySecret',
  'canCancel'
];

const availableFunctions = abi
  .filter(item => item.type === 'function')
  .map(item => item.name);

console.log('📋 Available functions:', availableFunctions.join(', '));

const missing = requiredFunctions.filter(fn => !availableFunctions.includes(fn));
if (missing.length > 0) {
  console.error('❌ Missing required functions:', missing.join(', '));
  process.exit(1);
}

console.log('✅ All required functions present');
console.log('📊 Contract size:', Math.round(contract.bytecode.object.length / 2), 'bytes');
"

if [ $? -ne 0 ]; then
    echo "❌ Contract interface test failed"
    exit 1
fi

echo ""
echo "🎉 Build and test completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Deploy contracts using: pnpm run deploy:contracts"
echo "2. Update .env with deployed contract addresses"
echo "3. Start the application: pnpm dev"
echo ""
echo "🔧 Available commands:"
echo "  pnpm dev           - Start both backend and frontend"
echo "  pnpm dev:server    - Start backend API only"  
echo "  pnpm dev:client    - Start frontend UI only"
echo "  pnpm test          - Run test suite"
echo ""
echo "🌐 Once running:"
echo "  Backend:  http://localhost:3000"
echo "  Frontend: http://localhost:3001"
echo ""